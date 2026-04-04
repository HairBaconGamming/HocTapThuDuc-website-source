const { GUILD_TREE_STAGES } = require('../utils/guildTreeUtils');

module.exports = GUILD_TREE_STAGES.map((stage) => ({
    stage: stage.stage,
    name: stage.name,
    motto: stage.motto,
    imageUrl: [
        'https://i.ibb.co/sknwggp/image-removebg-preview.png',
        'https://i.ibb.co/0j8ypXFk/image-removebg-preview-1.png',
        'https://i.ibb.co/Mym3XwYr/image-removebg-preview-2.png',
        'https://i.ibb.co/fGyTK9hY/image-removebg-preview-3.png',
        'https://i.ibb.co/SDG6BsrV/image-removebg-preview-4.png',
        'https://i.ibb.co/gb51GYYK/image-removebg-preview-5.png',
        'https://i.ibb.co/0VRCQNC4/image-removebg-preview-6.png',
        'https://i.ibb.co/mVd9CfsM/image-removebg-preview-7.png',
        'https://i.ibb.co/TBMyvrRt/image-removebg-preview-8.png',
        'https://i.ibb.co/Gf842bkq/image-removebg-preview-9.png'
    ][stage.stage] || '',
    auraClass: `guild-tree-stage-${stage.stage}`
}));
