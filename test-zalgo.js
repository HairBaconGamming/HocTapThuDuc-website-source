const zalgoText = 'B̸í̴ ̵k̶í̸p̷ ̷v̵i̵ế̸t̵ ̴v̸ă̵n̶ ̵h̵a̴y̶ ̴b̷a̴o̶ ̶g̴ồ̵m̷ ̷v̸i̶ệ';

function sanitizeZalgo(text) {
    if (typeof text !== 'string') return text;
    return text.normalize('NFC').replace(/[\u0300-\u036f\u1ab0-\u1aff\u1dc0-\u1dff\ufe20-\ufe2f\u20d0-\u20ff]/g, '');
}

console.log(sanitizeZalgo(zalgoText));
console.log(sanitizeZalgo('Hello 😊 ∑ x^2'));
