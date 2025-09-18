// models/Client.js
import { Schema, model } from "mongoose";

const ClientSchema = new Schema(
  {
    companyName: {
      type: String,
      // required: true,
    },
    companyId: {
      type: Schema.Types.ObjectId,
      ref: "JobDescription",
    },
    address: String,
    website: String,
    phone: String,
    notes: String,
    primaryContact: {
      type: String,
      // required: true,
    },
  },
  { timestamps: true }
);
const Client = model("Client", ClientSchema);

export default Client;
