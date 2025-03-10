module.exports = {
  async up(db, client) {
    try {
      // Update UserPreferences schema to add ML-based scheduling fields
      await db.collection('userpreferences').updateMany(
        {},
        {
          $set: {
            bufferTimePreference: 15,
            productivityPatterns: {
              mostProductiveHours: {},
              leastProductiveHours: {},
              focusTimePreference: 'morning',
              preferredMeetingDays: [2, 3, 4], // Tues, Wed, Thurs
              preferredMeetingDensity: 'spread'
            },
            meetingTypePreferences: {
              highIntensityBufferTime: 25,
              defaultMeetingDurationByType: {
                oneOnOne: 30,
                team: 45,
                client: 60,
                interview: 45,
                brainstorm: 60
              },
              preferredTimesByType: {
                oneOnOne: ['10:00', '15:00'],
                team: ['14:00'],
                client: ['11:00']
              }
            },
            focusTimePreferences: {
              minimumBlockDuration: 90,
              preferredDaysOfWeek: [2, 4], // Tues, Thurs
              preferredHours: [9, 10, 11], // Morning hours
              protectFromMeetings: true
            },
            learningData: {
              reschedulingAcceptanceRate: 0,
              bufferSuggestionAcceptanceRate: 0,
              focusTimeConsolidationAcceptanceRate: 0,
              commonRejectionPatterns: [],
              lastModelUpdate: new Date()
            }
          }
        }
      );
      console.log('Updated userpreferences with ML scheduling fields');

      // Check if schedulingmodels collection already exists
      const modelCollections = await db.listCollections({ name: 'schedulingmodels' }).toArray();
      
      if (modelCollections.length === 0) {
        // Create a new collection for ML model data if it doesn't exist
        await db.createCollection('schedulingmodels', {
          validator: {
            $jsonSchema: {
              bsonType: 'object',
              required: ['userId', 'modelType', 'modelData', 'version', 'createdAt', 'updatedAt'],
              properties: {
                userId: { bsonType: 'objectId' },
                modelType: { 
                  bsonType: 'string',
                  enum: ['bufferPrediction', 'productivityPrediction', 'meetingTypeClassifier', 'focusTimeOptimizer']
                },
                modelData: { bsonType: 'object' },
                version: { bsonType: 'string' },
                accuracy: { bsonType: 'double' },
                createdAt: { bsonType: 'date' },
                updatedAt: { bsonType: 'date' },
                metadata: { bsonType: 'object' }
              }
            }
          }
        });
        console.log('Created schedulingmodels collection');
      } else {
        console.log('Schedulingmodels collection already exists, skipping creation');
      }

      // Create indexes (skip if they exist)
      try {
        await db.collection('schedulingmodels').createIndex({ userId: 1, modelType: 1 });
        await db.collection('schedulingmodels').createIndex({ updatedAt: 1 });
        console.log('Created indexes on schedulingmodels collection');
      } catch (indexError) {
        // Index already exists, possibly with different options, just log and continue
        console.log('Some indexes on schedulingmodels already exist, skipping: ', indexError.message);
      }
      
      // Check if schedulingfeedback collection already exists
      const feedbackCollections = await db.listCollections({ name: 'schedulingfeedback' }).toArray();
      
      if (feedbackCollections.length === 0) {
        // Create a new collection for tracking user interactions with scheduling suggestions
        await db.createCollection('schedulingfeedback', {
          validator: {
            $jsonSchema: {
              bsonType: 'object',
              required: ['userId', 'suggestionId', 'actionType', 'result', 'timestamp'],
              properties: {
                userId: { bsonType: 'objectId' },
                suggestionId: { bsonType: 'objectId' },
                actionType: { 
                  bsonType: 'string',
                  enum: ['bufferTime', 'reschedule', 'focusTimeConsolidation', 'meetingTypeOptimization']
                },
                result: { 
                  bsonType: 'string',
                  enum: ['accepted', 'rejected', 'modified', 'ignored']
                },
                timestamp: { bsonType: 'date' },
                modifications: { bsonType: 'object' },
                context: { bsonType: 'object' }
              }
            }
          }
        });
        console.log('Created schedulingfeedback collection');
      } else {
        console.log('Schedulingfeedback collection already exists, skipping creation');
      }

      // Create indexes (skip if they exist)
      try {
        await db.collection('schedulingfeedback').createIndex({ userId: 1, actionType: 1 });
        await db.collection('schedulingfeedback').createIndex({ timestamp: 1 });
        await db.collection('schedulingfeedback').createIndex({ suggestionId: 1 });
        console.log('Created indexes on schedulingfeedback collection');
      } catch (indexError) {
        // Index already exists, possibly with different options, just log and continue
        console.log('Some indexes on schedulingfeedback already exist, skipping: ', indexError.message);
      }
    } catch (error) {
      console.error('Error in migration:', error);
      throw error;
    }
  },

  async down(db, client) {
    try {
      // Remove the new fields from UserPreferences
      await db.collection('userpreferences').updateMany(
        {},
        {
          $unset: {
            bufferTimePreference: "",
            productivityPatterns: "",
            meetingTypePreferences: "",
            focusTimePreferences: "",
            learningData: ""
          }
        }
      );

      // Drop the collections if they exist
      const modelCollections = await db.listCollections({ name: 'schedulingmodels' }).toArray();
      if (modelCollections.length > 0) {
        await db.collection('schedulingmodels').drop();
      }
      
      const feedbackCollections = await db.listCollections({ name: 'schedulingfeedback' }).toArray();
      if (feedbackCollections.length > 0) {
        await db.collection('schedulingfeedback').drop();
      }
      
      console.log('Removed ML scheduling fields and collections');
    } catch (error) {
      console.error('Error in down migration:', error);
      throw error;
    }
  }
};