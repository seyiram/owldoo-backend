module.exports = {
  async up(db, client) {
    try {
      // First check if collection exists
      const collections = await db.listCollections({ name: 'threads' }).toArray();
      if (collections.length === 0) {
        console.log("Threads collection doesn't exist, nothing to update");
        return;
      }

      // Update the Thread collection schema to add processing steps
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
              processingSteps: {
                bsonType: "array",
                items: {
                  bsonType: "object",
                  properties: {
                    stepType: {
                      bsonType: "string",
                    },
                    description: {
                      bsonType: "string",
                    },
                    timestamp: {
                      bsonType: "date",
                    },
                    details: {
                      bsonType: "object",
                    },
                  },
                },
              },
              relatedAgentTasks: {
                bsonType: "array",
                items: {
                  bsonType: "string",
                },
              },
            },
          },
        },
      });

      // Initialize empty processingSteps array for all existing threads
      await db.collection('threads').updateMany(
        { processingSteps: { $exists: false } },
        { $set: { processingSteps: [], relatedAgentTasks: [] } }
      );

      console.log("Successfully added processing steps to Thread model");
    } catch (error) {
      console.error("Failed to update Thread model:", error);
      throw error;
    }
  },

  async down(db, client) {
    try {
      // Check if collection exists
      const collections = await db.listCollections({ name: 'threads' }).toArray();
      if (collections.length === 0) {
        console.log("Threads collection doesn't exist, nothing to revert");
        return;
      }

      // Remove processingSteps field from all threads
      await db.collection('threads').updateMany(
        { },
        { $unset: { processingSteps: "", relatedAgentTasks: "" } }
      );

      // Revert the Thread collection schema
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

      console.log("Successfully removed processing steps from Thread model");
    } catch (error) {
      console.error("Failed to revert Thread model:", error);
      throw error;
    }
  },
};