module.exports = {
  async up(db, client) {
    try {
      // Remove clerkId field from all existing users
      await db.collection("users").updateMany(
        {}, 
        { 
          $unset: { clerkId: "" }
        }
      );

      console.log('Successfully removed clerkId field from users collection');
    } catch (error) {
      console.error('Migration failed:', error);
      throw error;
    }
  },

  async down(db, client) {
    try {
    
      await db.collection("users").updateMany(
        {}, 
        { 
          $set: { clerkId: null }
        }
      );

      console.log('Restored clerkId field to users collection');
    } catch (error) {
      console.error('Migration rollback failed:', error);
      throw error;
    }
  }
};