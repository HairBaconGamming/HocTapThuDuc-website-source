function sanitizeString(text) {
    if (typeof text !== 'string') return text;
    // Chuẩn hóa chuỗi về dạng NFC (Dựng sẵn - Precomposed) để bảo toàn kí tự tiếng Việt
    // Sau đó loại bỏ các kí tự kết hợp (Combining Diacritical Marks) thường dùng để tạo Zalgo text
    // Các dải Unicode bị loại bỏ:
    // U+0300 - U+036F: Combining Diacritical Marks
    // U+1AB0 - U+1AFF: Combining Diacritical Marks Extended
    // U+1DC0 - U+1DFF: Combining Diacritical Marks Supplement
    // U+FE20 - U+FE2F: Combining Half Marks
    // U+20D0 - U+20FF: Combining Diacritical Marks for Symbols
    return text.normalize('NFC').replace(/[\u0300-\u036f\u1ab0-\u1aff\u1dc0-\u1dff\ufe20-\ufe2f\u20d0-\u20ff]/g, '');
}

function sanitizeObject(obj, keyName = '') {
    // Bỏ qua các field nhạy cảm hoặc không cần filter
    if (keyName && ['password', 'passwordConfirm', 'currentPassword'].includes(keyName)) {
        return obj;
    }

    if (Array.isArray(obj)) {
        return obj.map(item => sanitizeObject(item, keyName));
    } else if (obj !== null && typeof obj === 'object') {
        const newObj = {};
        for (const [key, value] of Object.entries(obj)) {
            newObj[key] = sanitizeObject(value, key);
        }
        return newObj;
    } else if (typeof obj === 'string') {
        return sanitizeString(obj);
    }
    return obj;
}

const sanitizeZalgo = (req, res, next) => {
    if (req.body) {
        req.body = sanitizeObject(req.body);
    }
    if (req.query) {
        req.query = sanitizeObject(req.query);
    }
    // params ít khi bị người dùng nhập zalgo, nhưng cũng có thể thêm vào cho an toàn
    if (req.params) {
        req.params = sanitizeObject(req.params);
    }
    next();
};

module.exports = { sanitizeZalgo, sanitizeString, sanitizeObject };
