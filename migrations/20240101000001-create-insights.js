module.exports = {
  async up(db, client) {
    const collections = await db.listCollections({ name: 'insights' }).toArray();
    if (collections.length > 0) {
      console.log('Collection insights already exists, skipping creation');
      return Promise.resolve();
    }

    return db.createCollection('insights', {
      validator: {
        $jsonSchema: {
          bsonType: "object",
          required: ["userId", "title", "description", "category"],
          properties: {
            userId: { bsonType: "objectId" },
            title: { bsonType: "string" },
            description: { bsonType: "string" },
            category: { bsonType: "string" },
            actionable: { bsonType: "bool" },
            actionLink: { bsonType: "string" },
            timestamp: { bsonType: "date" }
          }
        }
      }
    })
    .then(() => db.collection('insights').createIndex({ userId: 1 }))
    .then(() => db.collection('insights').createIndex({ category: 1 }));
  },

  down(db, client) {
    return db.collection('insights').drop().catch(err => {
      if (err.code === 26) {
        console.log('Collection insights does not exist, skipping drop');
        return Promise.resolve();
      }
      throw err;
    });
  }
};
