module.exports = {
  async up(db, client) {
    const collections = await db.listCollections({ name: 'feedback' }).toArray();
    if (collections.length > 0) {
      console.log('Collection feedback already exists, skipping creation');
      return Promise.resolve();
    }
    
    return db.createCollection('feedback', {
      validator: {
        $jsonSchema: {
          bsonType: "object",
          required: ["userId", "responseId", "rating", "wasHelpful"],
          properties: {
            userId: { bsonType: "objectId" },
            responseId: { bsonType: "string" },
            rating: { 
              bsonType: "number",
              minimum: 1,
              maximum: 5
            },
            wasHelpful: { bsonType: "bool" },
            comments: { bsonType: "string" },
            corrections: { bsonType: "string" },
            createdAt: { bsonType: "date" },
            updatedAt: { bsonType: "date" }
          }
        }
      }
    })
    .then(() => db.collection('feedback').createIndex({ userId: 1 }))
    .then(() => db.collection('feedback').createIndex({ responseId: 1 }))
    .then(() => db.collection('feedback').createIndex({ createdAt: -1 }));
  },

  down(db, client) {
    return db.collection('feedback').drop().catch(err => {
      if (err.code === 26) {
        console.log('Collection feedback does not exist, skipping drop');
        return Promise.resolve();
      }
      throw err;
    });
  }
};
