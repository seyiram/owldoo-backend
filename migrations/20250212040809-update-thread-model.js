module.exports = {
  async up(db, client) {
    try {
      // First check if collection exists, if not create it
      const collections = await db.listCollections({ name: 'threads' }).toArray();
      if (collections.length === 0) {
        await db.createCollection('threads');
        console.log("Threads collection created");
      }

      // Then update the Thread collection schema
      await db.command({
        collMod: "threads",
        validator: {
          $jsonSchema: {
            bsonType: "object",
            required: ["userId", "messages"],
            properties: {
              userId: {
                bsonType: "objectId",
              },
              messages: {
                bsonType: "array",
                items: {
                  bsonType: "object",
                  required: ["sender", "content", "timestamp"],
                  properties: {
                    sender: {
                      bsonType: "string",
                    },
                    content: {
                      bsonType: "string",
                    },
                    timestamp: {
                      bsonType: "string",
                    },
                  },
                },
              },
            },
          },
        },
      });

      console.log("Thread model updated successfully");
    } catch (error) {
      console.error("Failed to update Thread model:", error);
      throw error;
    }
  },

  async down(db, client) {
    try {
      // Check if collection exists before attempting to revert
      const collections = await db.listCollections({ name: 'threads' }).toArray();
      if (collections.length > 0) {
        // Revert the Thread collection schema changes
        await db.command({
          collMod: "threads",
          validator: {
            $jsonSchema: {
              bsonType: "object",
              required: ["userId", "messages"],
              properties: {
                userId: {
                  bsonType: "objectId",
                },
                messages: {
                  bsonType: "array",
                  items: {
                    bsonType: "object",
                    required: ["sender", "content", "timestamp"],
                    properties: {
                      sender: {
                        bsonType: "string",
                      },
                      content: {
                        bsonType: "string",
                      },
                      timestamp: {
                        bsonType: "string",
                      },
                    },
                  },
                },
              },
            },
          },
        });

        console.log("Thread model reverted successfully");
      } else {
        console.log("Threads collection doesn't exist, nothing to revert");
      }
    } catch (error) {
      console.error("Failed to revert Thread model:", error);
      throw error;
    }
  },
};