// import mongoose from "mongoose";
// import bcrypt from "bcryptjs";

// const UserSchema = new mongoose.Schema({
//   firstName: {
//     type: String,
//     required: false,
//   },
//   lastName: {
//     type: String,
//     required: false,
//   },
//   company: {
//     type: String,
//     required: false,
//   },
//   companyId: {
//     type: mongoose.Schema.Types.ObjectId, // Store company _id
//     ref: "Company", // Reference the Company model
//     required: true,
//   },
//   website: {
//     type: String,
//     required: false,
//   },
//   phoneNumber: {
//     type: String,
//     required: false,
//   },
//   email: {
//     type: String,
//     required: true,
//     unique: true,
//   },
//   password: {
//     type: String,
//     required: true,
//   },
//   active: {
//     type: Boolean,
//     default: false, // Assuming new users are active by default
//   },
//   jobRole: {
//     type: String,
//     required: false,
//   },
//   resetPasswordToken: String,
//   resetPasswordExpire: Date,
//   userType: {
//     type: String,
//     enum: ["free", "pro", "lifetime"], // Allowed values for user type
//     default: "free", // Default user type is "free"
//   },
//   downloadCount: {
//     type: Number,
//     default: 0, // Track the number of downloads for free users
//   },
//   subscriptionExpiry: {
//     type: Date,
//     required: false, // Only relevant for "pro" users with an active subscription
//   },
// });

// UserSchema.index({ companyId: 1 }); // 1 for ascending index, -1 for descending index

// // Middleware to hash passwords before saving
// UserSchema.pre("save", async function (next) {
//   if (!this.isModified("password")) {
//     return next();
//   }
//   const salt = await bcrypt.genSalt(10);
//   this.password = await bcrypt.hash(this.password, salt);
//   next();
// });

// // Method to compare passwords
// UserSchema.methods.matchPassword = async function (enteredPassword) {
//   return await bcrypt.compare(enteredPassword, this.password);
// };

// // Method to check if a user can download an item
// UserSchema.methods.canDownload = function () {
//   if (this.userType === "lifetime") {
//     return true; // Lifetime users can always download
//   } else if (this.userType === "pro") {
//     // Pro users can download if their subscription is still active
//     return this.subscriptionExpiry && this.subscriptionExpiry > new Date();
//   } else if (this.userType === "free") {
//     // Free users can download up to 10 items
//     return this.downloadCount < 10;
//   }
//   return false; // Default case
// };

// // Method to increment the download count for free users
// UserSchema.methods.incrementDownloadCount = async function () {
//   if (this.userType === "free") {
//     this.downloadCount += 1;
//     await this.save();
//   }
// };

// const User = mongoose.model("User", UserSchema);

// export default User;

import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const UserSchema = new mongoose.Schema({
  firstName: {
    type: String,
    required: false,
  },
  lastName: {
    type: String,
    required: false,
  },
  company: {
    type: String,
    required: false,
  },
  companyId: {
    type: mongoose.Schema.Types.ObjectId, // Store company _id
    ref: "Company", // Reference the Company model
    required: true,
  },
  website: {
    type: String,
    required: false,
  },
  phoneNumber: {
    type: String,
    required: false,
  },
  email: {
    type: String,
    required: true,
    unique: true,
  },
  password: {
    type: String,
    required: true,
  },
  active: {
    type: Boolean,
    default: false, // Assuming new users are active by default
  },
  jobRole: {
    type: String,
    required: false,
  },
  resetPasswordToken: String,
  resetPasswordExpire: Date,
  userType: {
    type: String,
    enum: ["free", "pro", "lifetime"], // Allowed values for user type
    default: "free", // Default user type is "free"
  },
  downloadCount: {
    type: Number,
    default: 0, // Track the number of downloads for free users
  },
  subscriptionExpiry: {
    type: Date,
    required: false, // Only relevant for "pro" users with an active subscription
  },
  // New Calendly integration fields
  calendly: {
    type: {
      accessToken: {
        type: String,
        required: false,
      },
      refreshToken: {
        type: String,
        required: false,
      },
      expiresIn: {
        type: Number,
        required: false,
      },
      tokenCreatedAt: {
        type: Date,
        required: false,
      },
      calendlyUri: {
        type: String,
        required: false,
      },
      calendlyEmail: {
        type: String,
        required: false,
      },
      calendlyName: {
        type: String,
        required: false,
      },
      scheduleUrl: {
        type: String,
        required: false,
      },
    },
    required: false,
  },
});

UserSchema.index({ companyId: 1 }); // 1 for ascending index, -1 for descending index

// Middleware to hash passwords before saving
UserSchema.pre("save", async function (next) {
  if (!this.isModified("password")) {
    return next();
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Method to compare passwords
UserSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Method to check if a user can download an item
UserSchema.methods.canDownload = function () {
  if (this.userType === "lifetime") {
    return true; // Lifetime users can always download
  } else if (this.userType === "pro") {
    // Pro users can download if their subscription is still active
    return this.subscriptionExpiry && this.subscriptionExpiry > new Date();
  } else if (this.userType === "free") {
    // Free users can download up to 10 items
    return this.downloadCount < 10;
  }
  return false; // Default case
};

// Method to increment the download count for free users
UserSchema.methods.incrementDownloadCount = async function () {
  if (this.userType === "free") {
    this.downloadCount += 1;
    await this.save();
  }
};

// New method to check if user has connected Calendly
UserSchema.methods.isCalendlyConnected = function () {
  return !!(this.calendly && this.calendly.accessToken);
};

// New method to check if Calendly token needs refresh
UserSchema.methods.needsCalendlyTokenRefresh = function () {
  if (!this.calendly || !this.calendly.tokenCreatedAt || !this.calendly.expiresIn) {
    return false;
  }
  
  const tokenCreatedAt = new Date(this.calendly.tokenCreatedAt);
  const expiresIn = this.calendly.expiresIn;
  const now = new Date();
  const tokenExpiresAt = new Date(tokenCreatedAt.getTime() + expiresIn * 1000);
  
  // Return true if token is expired or will expire in the next 5 minutes
  return tokenExpiresAt <= now || (tokenExpiresAt - now) < 300000;
};

const User = mongoose.model("User", UserSchema);

export default User;