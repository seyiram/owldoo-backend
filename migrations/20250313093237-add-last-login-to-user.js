'use strict';

module.exports = {
  async up(db) {
    try {
      // Update all existing users to have a lastLogin field with current timestamp
      await db.collection('users').updateMany(
        { lastLogin: { $exists: false } },
        { 
          $set: { 
            lastLogin: new Date() 
          } 
        }
      );

      console.log('Successfully added lastLogin field to all existing users');
    } catch (error) {
      console.error('Error in migration:', error);
      throw error;
    }
  },

  async down(db) {
    try {
      // Remove lastLogin field from all users
      await db.collection('users').updateMany(
        {},
        { 
          $unset: { 
            lastLogin: "" 
          } 
        }
      );

      console.log('Successfully removed lastLogin field from all users');
    } catch (error) {
      console.error('Error in rollback:', error);
      throw error;
    }
  }
};