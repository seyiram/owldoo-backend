module.exports = {
  async up(db, client) {
    const collections = await db.listCollections({ name: 'agenttasks' }).toArray();
    if (collections.length > 0) {
      console.log('Collection agenttasks already exists, skipping creation');
      return Promise.resolve();
    }

    return db.createCollection('agenttasks', {
      validator: {
        $jsonSchema: {
          bsonType: "object",
          required: ["userId", "title", "description"],
          properties: {
            userId: { bsonType: "objectId" },
            title: { bsonType: "string" },
            description: { bsonType: "string" },
            status: { 
              bsonType: "string",
              enum: ["pending", "processing", "completed", "failed"]
            },
            priority: { bsonType: "number" },
            metadata: { bsonType: "object" },
            result: { bsonType: "object" },
            createdAt: { bsonType: "date" },
            updatedAt: { bsonType: "date" }
          }
        }
      }
    })
    .then(() => db.collection('agenttasks').createIndex({ userId: 1 }))
    .then(() => db.collection('agenttasks').createIndex({ status: 1 }))
    .then(() => db.collection('agenttasks').createIndex({ priority: -1 }));
  },

  down(db, client) {
    return db.collection('agenttasks').drop().catch(err => {
      if (err.code === 26) {
        console.log('Collection agenttasks does not exist, skipping drop');
        return Promise.resolve();
      }
      throw err;
    });
  }
};
