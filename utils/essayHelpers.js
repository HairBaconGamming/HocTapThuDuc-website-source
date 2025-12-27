const stringSimilarity = require("string-similarity");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const fetch = require("node-fetch");

// Config AI
const geminiApiKey = process.env.GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(geminiApiKey);
const geminiModel = genAI.getGenerativeModel({ model: "gemini-2.0-flash-thinking-exp-01-21" });
const generationConfig = { temperature: 0.7, topP: 0.95, topK: 64, maxOutputTokens: 65536, responseMimeType: "text/plain" };

// --- Text Processing Helpers ---
function expandText(text) {
    if (typeof text !== "string") return [];
    return text.trim().split(/\s+/).flatMap(word => {
        const parts = word.match(/(\p{L}+|\p{N}+|[^\p{L}\p{N}\s]+)/gu);
        return parts || [word];
    });
}

function isPunctuation(str) { return /^[\.,!?;:“”()\[\]{}]+$/.test(str); }

function buildLCSMatrix(sTokens, tTokens) {
    const dp = Array.from({ length: sTokens.length + 1 }, () => Array(tTokens.length + 1).fill(0));
    for (let i = 1; i <= sTokens.length; i++) {
        for (let j = 1; j <= tTokens.length; j++) {
            if (sTokens[i - 1].toLowerCase() === tTokens[j - 1].toLowerCase()) dp[i][j] = dp[i - 1][j - 1] + 1;
            else dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
    }
    return dp;
}

function reconstructDiff(sTokens, tTokens, dp) {
    let i = sTokens.length, j = tTokens.length;
    const tokens = [];
    while (i > 0 && j > 0) {
        if (sTokens[i - 1].toLowerCase() === tTokens[j - 1].toLowerCase()) { tokens.push(tTokens[j - 1]); i--; j--; }
        else if (dp[i - 1][j] >= dp[i][j - 1]) { tokens.push(`<span class="diff-error">${sTokens[i - 1]}</span>`); i--; }
        else { tokens.push(`<span class="diff-error strikethrough">${tTokens[j - 1]}</span>`); j--; }
    }
    while (i > 0) { tokens.push(`<span class="diff-error">${sTokens[i - 1]}</span>`); i--; }
    while (j > 0) { tokens.push(`<span class="diff-error strikethrough">${tTokens[j - 1]}</span>`); j--; }
    return tokens.reverse().join(" ").replace(/\s+(?=[.,!?;:])/g, ""); // Basic cleanup
}

function getWordDiff(sample, student) {
    const sTokens = expandText(sample);
    const tTokens = expandText(student);
    return reconstructDiff(sTokens, tTokens, buildLCSMatrix(sTokens, tTokens));
}

// --- Grading Logic ---
async function getEmbedding(text) {
    if (typeof text !== "string" || text.trim().length < 5) throw new Error("Invalid text for embedding");
    const response = await fetch("https://api-inference.huggingface.co/models/questgen/all-mpnet-base-v2-feature-extraction-pipeline", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.HF_API_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({ inputs: text.trim() }),
    });
    const data = await response.json();
    if (data.error) throw new Error(data.error);
    return data[0]; // Assuming valid response structure
}

function cosineSimilarity(vecA, vecB) {
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < vecA.length; i++) {
        dot += vecA[i] * vecB[i];
        normA += vecA[i] ** 2;
        normB += vecB[i] ** 2;
    }
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function gradeEssaySimple(model, student) {
    return Math.round(stringSimilarity.compareTwoStrings(model, student) * 100);
}

async function gradeEssaySmart(model, student) {
    try {
        const [v1, v2] = await Promise.all([getEmbedding(model), getEmbedding(student)]);
        return Math.round(cosineSimilarity(v1, v2) * 100);
    } catch (e) { console.error("Smart grade failed, fallback:", e.message); return gradeEssaySimple(model, student); }
}

function levenshtein(a, b) {
    // Basic levenshtein implementation (omitted for brevity, assume standard matrix implementation)
    // You can copy the exact function from your original code here
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;
    const matrix = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) matrix[i][j] = matrix[i - 1][j - 1];
            else matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
        }
    }
    return matrix[b.length][a.length];
}

async function gradeEssayAIAll(essayData, answers) {
    let prompt = `Đánh giá các câu trả lời sau... (Copy prompt template from original code)...`;
    // Loop to build prompt...
    for (let i = 0; i < essayData.length; i++) {
        prompt += `Question ${i + 1}:\nIdeal: "${essayData[i].sampleAnswer}"\nStudent: "${answers[i]}"\n...\n`;
    }
    
    try {
        const result = await geminiModel.startChat({ generationConfig, history: [] }).sendMessage(prompt);
        const text = result.response.text();
        const scores = [], comments = [];
        // Parse logic (Copy regex parsing from original code)
        const blocks = text.split(/\n\s*\n/);
        blocks.forEach(block => {
            let s = 0, c = "";
            const sm = block.match(/^Score:\s*(\d{1,3})/i); if(sm) s = parseInt(sm[1]);
            const cm = block.match(/^Comment:\s*(.+)/i); if(cm) c = cm[1].trim();
            scores.push(s); comments.push(c);
        });
        return { scores, comments };
    } catch (e) {
        return { scores: essayData.map(() => 0), comments: essayData.map(() => "AI Error") };
    }
}

// Process Lesson Content Helper
function processLessonContent(body) {
    let { content, type, editorData } = body;
    if (typeof content !== "string" || content.trim() === "") {
        if (type === "markdown" && editorData?.markdown) return editorData.markdown;
        if (type === "video" && editorData?.video) return editorData.video;
        if (type === "quiz" && editorData?.quiz) return "Bài trắc nghiệm";
        if (type === "essay") return (editorData?.essayPrompt || "") + "\n\n" + (editorData?.essay || "");
        if (type === "document" && editorData?.document) {
            try { return `Tài liệu: ${JSON.parse(editorData.document).originalName}`; } 
            catch { return "Tài liệu đính kèm"; }
        }
        return "";
    }
    return content;
}

module.exports = {
    expandText, isPunctuation, getWordDiff, gradeEssaySimple, gradeEssaySmart, gradeEssayAIAll, levenshtein, processLessonContent
};