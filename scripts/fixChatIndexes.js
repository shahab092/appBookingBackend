const dotenv = require("dotenv");
const mongoose = require("mongoose");

dotenv.config();

const CHAT_COLLECTION = "chats";
const OLD_INDEX_NAME = "patientId_1_doctorId_1";
const APPOINTMENT_INDEX_NAME = "appointmentId_1";

const fixChatIndexes = async () => {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is not set");
  }

  await mongoose.connect(process.env.MONGODB_URI);

  const collection = mongoose.connection.db.collection(CHAT_COLLECTION);
  const indexes = await collection.indexes();
  const oldIndex = indexes.find((index) => index.name === OLD_INDEX_NAME);

  if (oldIndex) {
    await collection.dropIndex(OLD_INDEX_NAME);
    console.log(`Dropped stale unique index: ${OLD_INDEX_NAME}`);
  } else {
    console.log(`Stale index not found: ${OLD_INDEX_NAME}`);
  }

  await collection.createIndex(
    { appointmentId: 1 },
    { unique: true, name: APPOINTMENT_INDEX_NAME }
  );
  console.log(`Ensured unique index: ${APPOINTMENT_INDEX_NAME}`);
};

fixChatIndexes()
  .then(async () => {
    await mongoose.connection.close();
    console.log("Chat indexes fixed successfully");
    process.exit(0);
  })
  .catch(async (error) => {
    console.error("Failed to fix chat indexes:", error.message);
    await mongoose.connection.close().catch(() => {});
    process.exit(1);
  });
