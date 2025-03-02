module.exports = {
  async up(db, client) {
    const collections = await db.listCollections({ name: 'suggestions' }).toArray();
    if (collections.length > 0) {
      console.log('Collection suggestions already exists, skipping creation');
      return Promise.resolve();
    }
    
    return db.createCollection('suggestions', {
      validator: {
        $jsonSchema: {
          bsonType: "object",
          required: ["userId", "type", "title", "description", "action", "expiresAt"],
          properties: {
            userId: { bsonType: "objectId" },
            type: { bsonType: "string" },
            title: { bsonType: "string" },
            description: { bsonType: "string" },
            action: {
              bsonType: "object",
              required: ["type", "data"],
              properties: {
                type: { bsonType: "string" },
                data: { bsonType: "object" }
              }
            },
            status: {
              bsonType: "string",
              enum: ["pending", "accepted", "dismissed"]
            },
            relevance: { bsonType: "number" },
            createdAt: { bsonType: "date" },
            updatedAt: { bsonType: "date" },
            expiresAt: { bsonType: "date" }
          }
        }
      }
    })
    .then(() => db.collection('suggestions').createIndex({ userId: 1 }))
    .then(() => db.collection('suggestions').createIndex({ status: 1 }));
  },

  down(db, client) {
    return db.collection('suggestions').drop().catch(err => {
      if (err.code === 26) {
        console.log('Collection suggestions does not exist, skipping drop');
        return Promise.resolve();
      }
      throw err;
    });
  }
};
