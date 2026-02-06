import React, { useState, ChangeEvent, FormEvent } from 'react';
import { StarIcon, CheckIcon, LoadingSpinner } from '../Icons/Icons';
import { feedbackAPI, FeedbackData } from '../../services/api';

const FeedbackForm: React.FC = () => {
  const [formData, setFormData] = useState<FeedbackData>({
    name: '',
    email: '',
    subject: '',
    message: '',
    rating: 5
  });
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submitted, setSubmitted] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>): void => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    setError(null);
  };

  const handleRatingClick = (rating: number): void => {
    setFormData(prev => ({ ...prev, rating }));
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    if (!formData.name || !formData.email || !formData.subject || !formData.message) {
      setError('Please fill in all fields');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await feedbackAPI.submit(formData);
      if (response.success) setSubmitted(true);
      else setError(response.error || 'Failed to submit feedback');
    } catch {
      setError('Failed to submit feedback. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center bg-white">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
          <CheckIcon className="w-8 h-8 text-green-600" />
        </div>
        <h3 className="text-xl font-bold mb-2 text-slate-800">Thank You!</h3>
        <p className="text-sm mb-6 text-slate-500">
          Your feedback has been submitted successfully. We appreciate your input!
        </p>
        <button
          onClick={() => {
            setSubmitted(false);
            setFormData({ name: '', email: '', subject: '', message: '', rating: 5 });
          }}
          className="px-6 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 
                     transition-colors text-sm font-medium cursor-pointer shadow-md"
        >
          Send Another
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="p-4 border-b border-slate-200 bg-gradient-to-r from-amber-50 to-yellow-50">
        <h3 className="font-semibold text-slate-800">Send Feedback</h3>
        <p className="text-xs mt-1 text-slate-500">We'd love to hear from you!</p>
      </div>

      <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 chat-scrollbar-light">
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm font-medium text-red-600">
            {error}
          </div>
        )}

        <div className="space-y-4">
          {/* Rating */}
          <div>
            <label className="block text-sm font-medium mb-2 text-slate-700">Rate your experience</label>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => handleRatingClick(star)}
                  className="p-1 hover:scale-110 transition-transform cursor-pointer"
                >
                  <StarIcon
                    className={`w-8 h-8 ${star <= formData.rating ? 'text-yellow-400' : 'text-slate-300'}`}
                    filled={star <= formData.rating}
                  />
                </button>
              ))}
            </div>
          </div>

          {/* Name */}
          <div>
            <label className="block text-sm font-medium mb-1 text-slate-700">Name</label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              placeholder="Your name"
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-sm
                         text-slate-800 placeholder:text-slate-400
                         focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100"
            />
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-medium mb-1 text-slate-700">Email</label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="your@email.com"
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-sm
                         text-slate-800 placeholder:text-slate-400
                         focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100"
            />
          </div>

          {/* Subject */}
          <div>
            <label className="block text-sm font-medium mb-1 text-slate-700">Subject</label>
            <select
              name="subject"
              value={formData.subject}
              onChange={handleChange}
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-sm
                         text-slate-800 focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100"
            >
              <option value="">Select a subject</option>
              <option value="General Feedback">General Feedback</option>
              <option value="Bug Report">Bug Report</option>
              <option value="Feature Request">Feature Request</option>
              <option value="Content Suggestion">Content Suggestion</option>
              <option value="Other">Other</option>
            </select>
          </div>

          {/* Message */}
          <div>
            <label className="block text-sm font-medium mb-1 text-slate-700">Message</label>
            <textarea
              name="message"
              value={formData.message}
              onChange={handleChange}
              placeholder="Tell us what you think..."
              rows={4}
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-sm
                         text-slate-800 placeholder:text-slate-400 resize-none
                         focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100"
            />
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3 bg-gradient-to-r from-amber-500 to-yellow-500 
                       text-white rounded-lg font-medium text-sm
                       hover:from-amber-600 hover:to-yellow-600
                       disabled:opacity-50 disabled:cursor-not-allowed
                       transition-all duration-200 shadow-lg
                       flex items-center justify-center gap-2 cursor-pointer"
          >
            {isSubmitting ? (
              <>
                <LoadingSpinner className="w-5 h-5" />
                Submitting...
              </>
            ) : (
              'Submit Feedback'
            )}
          </button>
        </div>
      </form>
    </div>
  );
};

export default FeedbackForm;