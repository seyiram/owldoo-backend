module.exports = {
  async up(db, client) {
    try {
      // First check if collection exists
      const collections = await db.listCollections({ name: 'threads' }).toArray();
      if (collections.length === 0) {
        console.log("Threads collection doesn't exist, nothing to update");
        return;
      }

      // Update the Thread collection schema to add conversationId field
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
              conversationId: {
                bsonType: "string",
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

      // Create an index on conversationId field for faster lookups
      await db.collection('threads').createIndex({ conversationId: 1 });

      // Find existing threads that have a corresponding conversation
      const conversations = await db.collection('conversations').find({ threadId: { $exists: true } }).toArray();
      
      console.log(`Found ${conversations.length} conversations with threadIds`);

      // Import MongoDB ObjectId
      const { ObjectId } = require('mongodb');

      // Update each thread with the conversationId from its conversation
      let updatedCount = 0;
      for (const conversation of conversations) {
        if (conversation.threadId) {
          try {
            const result = await db.collection('threads').updateOne(
              { _id: new ObjectId(conversation.threadId) },
              { $set: { conversationId: conversation.conversationId } }
            );
            
            if (result.modifiedCount > 0) {
              updatedCount++;
            }
          } catch (err) {
            console.error(`Error updating thread ${conversation.threadId}:`, err);
          }
        }
      }

      console.log(`Successfully updated ${updatedCount} threads with conversationId`);
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

      // Remove conversationId field from all threads
      await db.collection('threads').updateMany(
        { },
        { $unset: { conversationId: "" } }
      );

      // Drop the index on conversationId
      try {
        await db.collection('threads').dropIndex('conversationId_1');
        console.log("Dropped index on conversationId");
      } catch (indexError) {
        console.log("Index on conversationId not found or already dropped");
      }

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

      console.log("Successfully removed conversationId from Thread model");
    } catch (error) {
      console.error("Failed to revert Thread model:", error);
      throw error;
    }
  },
};