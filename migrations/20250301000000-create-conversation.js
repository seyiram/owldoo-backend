module.exports = {
  async up(db) {
    try {
      // Check if collection already exists
      const collections = await db.listCollections({ name: 'conversations' }).toArray();
      
      if (collections.length === 0) {
        // Create the conversation collection with schema validation if it doesn't exist
        await db.createCollection('conversations', {
          validator: {
            $jsonSchema: {
              bsonType: 'object',
              required: ['userId', 'conversationId', 'startTime', 'lastActivityTime', 'turns', 'context', 'isActive'],
              properties: {
                userId: {
                  bsonType: 'objectId',
                  description: 'must be an ObjectId and is required'
                },
                conversationId: {
                  bsonType: 'string',
                  description: 'must be a string and is required'
                },
                startTime: {
                  bsonType: 'date',
                  description: 'must be a date and is required'
                },
                lastActivityTime: {
                  bsonType: 'date',
                  description: 'must be a date and is required'
                },
                turns: {
                  bsonType: 'array',
                  description: 'must be an array and is required',
                  items: {
                    bsonType: 'object',
                    required: ['speaker', 'content', 'timestamp'],
                    properties: {
                      speaker: {
                        enum: ['user', 'assistant'],
                        description: 'must be either user or assistant and is required'
                      },
                      content: {
                        bsonType: 'string',
                        description: 'must be a string and is required'
                      },
                      timestamp: {
                        bsonType: 'date',
                        description: 'must be a date and is required'
                      },
                      intent: {
                        bsonType: 'object',
                        description: 'intent information if available'
                      },
                      action: {
                        bsonType: 'object',
                        description: 'action information if available'
                      }
                    }
                  }
                },
                context: {
                  bsonType: 'object',
                  required: ['activeEntities', 'referencedEvents', 'goals', 'environmentContext'],
                  properties: {
                    activeEntities: {
                      bsonType: 'object',
                      description: 'current active entities in the conversation'
                    },
                    referencedEvents: {
                      bsonType: 'array',
                      description: 'events referenced in the conversation'
                    },
                    goals: {
                      bsonType: 'array',
                      description: 'conversation goals'
                    },
                    preferences: {
                      bsonType: 'object',
                      description: 'user preferences applicable to this conversation'
                    },
                    environmentContext: {
                      bsonType: 'object',
                      required: ['timezone'],
                      properties: {
                        timezone: {
                          bsonType: 'string',
                          description: 'user timezone'
                        },
                        location: {
                          bsonType: 'string',
                          description: 'user location if available'
                        },
                        device: {
                          bsonType: 'string',
                          description: 'user device if available'
                        }
                      }
                    }
                  }
                },
                isActive: {
                  bsonType: 'bool',
                  description: 'indicates if the conversation is active'
                },
                createdAt: {
                  bsonType: 'date',
                  description: 'timestamp when the document was created'
                },
                updatedAt: {
                  bsonType: 'date',
                  description: 'timestamp when the document was last updated'
                }
              }
            }
          }
        });
        console.log('Created conversations collection with schema validation');
      } else {
        console.log('Conversations collection already exists, skipping creation');
      }
      
      // Create indexes for efficient querying (idempotent - will not fail if already exists)
      await db.collection('conversations').createIndex({ userId: 1 });
      await db.collection('conversations').createIndex({ conversationId: 1 }, { unique: true });
      await db.collection('conversations').createIndex({ lastActivityTime: -1 });
      await db.collection('conversations').createIndex({ isActive: 1 });
      await db.collection('conversations').createIndex({ userId: 1, isActive: 1, lastActivityTime: -1 });

      console.log('Created indexes on conversations collection');
    } catch (error) {
      console.error('Error in migration:', error);
      throw error;
    }
  },

  async down(db) {
    try {
      // Remove the collection
      await db.collection('conversations').drop();
      console.log('Dropped conversations collection');
    } catch (error) {
      console.error('Error dropping collection:', error);
      throw error;
    }
  }
};