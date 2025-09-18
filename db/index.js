import mongoose from "mongoose";

// const dbName = "bloomix"
// const connectDB = async() => {
//     try {
//        const connectionInstance = await mongoose.connect(`${process.env.MONGO_URI}/${dbName}`)

//        console.log(`Database Connected!! DB Host: ${connectionInstance.connection.host}`)
//     } catch (error) {
//         console.log("Database error -->", error)
//         process.exit(1);
//     }
// }
const dbName = "bloomix";
const connectDB = async () => {
  try {
    const connectionInstance = await mongoose.connect(
      `${process.env.MONGO_URI}/${dbName}`
    );
    // const connectionInstance = await mongoose.connect(
    //   `${process.env.MONGO_URI}/${dbName}`,
    //   {
    //     // useNewUrlParser: true,
    //     // useUnifiedTopology: true,
    //     // serverSelectionTimeoutMS: 5000, // Keep trying to send operations for 5 seconds
    //     // socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
    //     // maxPoolSize: 10, // Maintain up to 10 socket connections
    //   }
    // );

    console.log(
      `Database Connected!! DB Host: ${connectionInstance.connection.host}`
    );
  } catch (error) {
    console.log("Database error -->", error);
    process.exit(1);
  }

  mongoose.connection.on("connected", () => {
    console.log("Mongoose connected to DB");
  });

  mongoose.connection.on("error", (err) => {
    console.error(`Mongoose connection error: ${err}`);
  });

  mongoose.connection.on("disconnected", () => {
    console.log("Mongoose disconnected");
  });

  process.on("SIGINT", async () => {
    await mongoose.connection.close();
    console.log("Mongoose disconnected on app termination");
    process.exit(0);
  });
};

export default connectDB;
