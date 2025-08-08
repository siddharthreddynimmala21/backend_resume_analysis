import mongoose from "mongoose";

const questionSchema = new mongoose.Schema({}, { strict: false, _id: false });

const interviewSessionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true },
  interviews: [
    {
      sessionId: { type: String, required: true, index: true },
      rounds: [
        {
          round: { type: Number, required: true },
          questions: { type: [mongoose.Schema.Types.Mixed], default: [] },
          answers: { type: mongoose.Schema.Types.Mixed, default: {} },
          createdAt: { type: Date, default: Date.now },
        },
      ],
    },
  ],
});

export default mongoose.model("InterviewSession", interviewSessionSchema);
