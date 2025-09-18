import mongoose from 'mongoose';

const ModificationSchema = new mongoose.Schema({
    user_name: {
        type: String,
        required: false
    },
    user_email: {
        type: String,
        required: false
    },
    date: {
        type: Date,
        default: Date.now,
        required: false
    }
});

const AssigneeSchema = new mongoose.Schema({
    name: {
        type: String,
        required: false
    },
    email: {
        type: String,
        required: false
    },
    assignDate: {
        type: Date,
        default: Date.now,
        required: false
    }
});

const JobDescriptionSchema = new mongoose.Schema({
    context: {
        type: String,
        required: true
    },
    company_name: {
        type: String,
        required: true
    },
    short_description: {
        type: String,
        required: true
    },
    key_responsibilities: {
        type: [String],
        required: true
    },
    qualifications: {
        type: [String],
        required: true
    },
    experience_required: {
        type: [String],
        required: true
    },
    other_relevant_details: {
        type: [String],
        required: true
    },
    markdown_description: {
        type: String,
        required: true
    },
    created_by: {
        user_name: {
            type: String,
            required: false
        },
        user_email: {
            type: String,
            required: false
        },
        date: {
            type: Date,
            default: Date.now,
            required: true
        }
    },
    modifications: [ModificationSchema], // Stores modification history
    status: {
        type: String,
        // enum: ['Open', 'Candidate Pool', 'Apptitude Test', 'Hired'], // Example status values
        required: false
    },
    assignee: {
        type: AssigneeSchema,
        required: false
    },
    created_at: {
        type: Date,
        default: Date.now
    }
});

const JobDescription = mongoose.model('JobDescription', JobDescriptionSchema);

// export default JobDescription;
