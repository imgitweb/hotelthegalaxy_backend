const mongoose = require("mongoose");

const enquirySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 100,
      index: true,
    },

    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },

    phone: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },

    type: {
      type: String,
      enum: [
        "Hotel Booking",
        "Restaurant Reservation",
        "Buffet Enquiry",
        "Banquet Hall",
      ],
      required: true,
    },

    message: {
      type: String,
      required: true,
      maxlength: 2000,
    },

    status: {
      type: String,
      enum: ["new", "contacted", "closed"],
      default: "new",
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("Enquiry", enquirySchema);
