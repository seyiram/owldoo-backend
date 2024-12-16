module.exports = {
  async up(db, client) {
    try {
      // Create collections using db
      await db.createCollection("users");
      await db.createCollection("userpreferences");
      await db.createCollection("eventcache");
      await db.createCollection("nlplogs");
      await db.createCollection("errorlogs");
      await db.createCollection("eventanalytics");
      await db.createCollection("smartsuggestions");

      // Create indexes using db
      await db.collection("users").createIndex(
        { email: 1 }, 
        { unique: true }
      );
      await db.collection("users").createIndex(
        { googleId: 1 }, 
        { unique: true }
      );

      await db.collection("userpreferences").createIndex(
        { userId: 1 }, 
        { unique: true }
      );

      await db.collection("eventcache").createIndex(
        { googleEventId: 1, userId: 1 }, 
        { unique: true }
      );

      await db.collection("nlplogs").createIndex(
        { userId: 1, createdAt: -1 }
      );

      await db.collection("errorlogs").createIndex(
        { createdAt: -1 }
      );
      await db.collection("errorlogs").createIndex(
        { userId: 1 }
      );

      // Add initial data using db
      const usersCollection = db.collection("users");
      const preferencesCollection = db.collection("userpreferences");

      const systemUser = await usersCollection.insertOne({
        email: "system@owldoo.com",
        googleId: "system",
        createdAt: new Date(),
        updatedAt: new Date()
      });

      await preferencesCollection.insertOne({
        userId: systemUser.insertedId,
        workingHours: {
          start: "09:00",
          end: "17:00",
          workDays: [1, 2, 3, 4, 5]
        },
        defaultMeetingDuration: 30,
        timeZone: "UTC",
        createdAt: new Date(),
        updatedAt: new Date()
      });

      console.log('Migration completed successfully');

    } catch (error) {
      console.error('Migration failed:', error);
      throw error;
    }
  },

  async down(db, client) {
    try {
      const collections = [
        "smartsuggestions",
        "eventanalytics",
        "errorlogs",
        "nlplogs",
        "eventcache",
        "userpreferences",
        "users"
      ];

      for (const collection of collections) {
        if (await db.listCollections({ name: collection }).hasNext()) {
          await db.collection(collection).drop();
          console.log(`Dropped collection: ${collection}`);
        }
      }

      console.log('Rollback completed successfully');
    } catch (error) {
      console.error('Rollback failed:', error);
      throw error;
    }
  }
};