import mongoose from "mongoose";

export default async function connectDB() {
  try {
    const conn = await mongoose.connect(
      `mongodb+srv://admin-rohan11sharma:${process.env.MONGODB_PASSWORD}@cluster0.ogyw5zf.mongodb.net/wgfsb1blogAppDB`
    );
    console.log("Connected to db | host :", conn.connection.host);
  } catch (err) {
    console.log(err);
  }
}
