module.exports = {
  async up(db, client) {
    try {
      // Get all threads with processingSteps field
      const threadsWithProcessingSteps = await db.collection('threads').find({ processingSteps: { $exists: true } }).toArray();
      console.log(`Found ${threadsWithProcessingSteps.length} threads with "processingSteps" field`);
      
      // For each thread, move the processingSteps data to the correct processingSteps field
      for (const thread of threadsWithProcessingSteps) {
        // Only update if we have processingSteps data and processingSteps doesn't already exist
        if (Array.isArray(thread.processingSteps) && (!thread.processingSteps || !Array.isArray(thread.processingSteps))) {
          await db.collection('threads').updateOne(
            { _id: thread._id },
            { 
              $set: { processingSteps: thread.processingSteps },
              $unset: { processingSteps: "" }
            }
          );
          console.log(`Fixed thread ${thread._id} - moved processing steps to correct field`);
        }
      }
      
      // Update the schema definition to use the correct field name
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
              conversationId: {
                bsonType: "string",
              },
            },
          },
        },
      });
      
      console.log("Successfully fixed processing steps field in Thread model");
    } catch (error) {
      console.error("Failed to fix processing steps field:", error);
      throw error;
    }
  },

  async down(db, client) {
    try {
      // Get all threads with processingSteps field
      const threadsWithProcessingSteps = await db.collection('threads').find({ processingSteps: { $exists: true } }).toArray();
      
      // For each thread, move the data back to the old field name
      for (const thread of threadsWithProcessingSteps) {
        if (Array.isArray(thread.processingSteps)) {
          await db.collection('threads').updateOne(
            { _id: thread._id },
            { 
              $set: { processingSteps: thread.processingSteps },
              $unset: { processingSteps: "" }
            }
          );
        }
      }
      
      console.log("Reverted fix for processing steps field name");
    } catch (error) {
      console.error("Failed to revert fix for processing steps field:", error);
      throw error;
    }
  }
};
