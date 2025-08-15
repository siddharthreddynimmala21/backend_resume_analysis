import InterviewSession from '../models/InterviewSession.js';

class ReportGenerator {
    constructor() {
        this.roundNames = {
            1: 'Technical Round 1',
            2: 'Technical Round 2',
            3: 'Managerial Round',
            4: 'HR Round'
        };
    }

    /**
     * Generate comprehensive interview report
     * @param {string} userId - User ID
     * @param {string} sessionId - Interview session ID
     * @returns {Object} Complete interview report
     */
    async generateInterviewReport(userId, sessionId) {
        try {
            // Fetch interview data
            const session = await InterviewSession.findOne({
                userId,
                'interviews.sessionId': sessionId
            });

            if (!session) {
                throw new Error('Interview session not found');
            }

            const interview = session.interviews.find(i => i.sessionId === sessionId);
            if (!interview) {
                throw new Error('Interview not found');
            }

            // Generate round-wise reports
            const roundReports = await this.generateRoundReports(interview.rounds);

            // Generate overall analysis
            const overallAnalysis = this.generateOverallAnalysis(interview.rounds);

            // Generate improvement suggestions
            const improvementSuggestions = this.generateImprovementSuggestions(interview.rounds);

            return {
                sessionId,
                interviewDate: interview.rounds[0]?.createdAt || new Date(),
                totalRounds: interview.rounds.length,
                roundReports,
                overallAnalysis,
                improvementSuggestions,
                generatedAt: new Date()
            };

        } catch (error) {
            console.error('Error generating interview report:', error);
            throw error;
        }
    }

    /**
     * Generate detailed reports for each round
     * @param {Array} rounds - Array of round data
     * @returns {Array} Array of round reports
     */
    async generateRoundReports(rounds) {
        return rounds.map(round => {
            const mcqReport = this.generateMCQReport(round);
            const descriptiveReport = this.generateDescriptiveReport(round);

            return {
                roundNumber: round.round,
                roundName: this.roundNames[round.round] || `Round ${round.round}`,
                completedAt: round.validatedAt || round.submittedAt,
                mcqReport,
                descriptiveReport,
                overallScore: {
                    total: round.validation?.total_score || 0,
                    maxPossible: round.validation?.max_possible_score || 0,
                    percentage: round.validation?.percentage || 0,
                    verdict: round.validation?.verdict || 'Not Completed'
                }
            };
        });
    }

    /**
     * Generate MCQ report for a round
     * @param {Object} round - Round data
     * @returns {Object} MCQ report
     */
    generateMCQReport(round) {
        const mcqValidation = round.validation?.mcq || { score: 0, max_score: 0, details: [] };

        return {
            score: mcqValidation.score,
            maxScore: mcqValidation.max_score,
            percentage: mcqValidation.max_score > 0 ? Math.round((mcqValidation.score / mcqValidation.max_score) * 100) : 0,
            questions: mcqValidation.details.map((detail, index) => {
                // Find the full text of the correct answer from options
                const correctAnswerFull = this.getFullCorrectAnswer(detail.correct_answer, detail.options || []);

                return {
                    questionNumber: index + 1,
                    question: detail.question,
                    options: detail.options || [],
                    userAnswer: detail.user_answer || 'Not Answered',
                    correctAnswer: detail.correct_answer, // Keep the letter for reference
                    correctAnswerFull: correctAnswerFull, // Add the full text
                    isCorrect: detail.is_correct || false,
                    explanation: this.generateMCQExplanation(detail)
                };
            })
        };
    }

    /**
     * Generate descriptive report for a round
     * @param {Object} round - Round data
     * @returns {Object} Descriptive report
     */
    generateDescriptiveReport(round) {
        const descValidation = round.validation?.descriptive || { score: 0, max_score: 0, details: [] };

        return {
            score: descValidation.score,
            maxScore: descValidation.max_score,
            percentage: descValidation.max_score > 0 ? Math.round((descValidation.score / descValidation.max_score) * 100) : 0,
            questions: descValidation.details.map((detail, index) => ({
                questionNumber: index + 1,
                question: detail.question,
                userAnswer: detail.user_answer || 'Not Answered',
                score: detail.score || 0,
                maxScore: detail.max_score || 3,
                feedback: detail.feedback || 'No feedback available',
                suggestions: this.generateDescriptiveSuggestions(detail)
            }))
        };
    }

    /**
     * Generate explanation for MCQ answers
     * @param {Object} detail - MCQ detail object
     * @returns {string} Explanation
     */
    generateMCQExplanation(detail) {
        if (detail.is_correct) {
            return "✅ Correct! Well done.";
        } else {
            // Get the full correct answer text
            const fullCorrectAnswer = this.getFullCorrectAnswer(detail.correct_answer, detail.options || []);
            // Generate technical explanation based on the question and correct answer
            const explanation = this.generateTechnicalExplanation(detail.question, detail.correct_answer, detail.options);
            return `❌ Incorrect. The correct answer is ${fullCorrectAnswer}.\n\n${explanation}`;
        }
    }

    /**
     * Generate technical explanation for MCQ answers
     * @param {string} question - The question text
     * @param {string} correctAnswer - The correct answer
     * @param {Array} options - All answer options
     * @returns {string} Technical explanation
     */
    generateTechnicalExplanation(question, correctAnswer, options) {
        // Extract the correct option text
        const correctOption = options.find(opt => opt.startsWith(correctAnswer.charAt(0))) || correctAnswer;

        // Generate explanation based on common technical concepts
        const questionLower = question.toLowerCase();

        // JavaScript/Programming concepts
        if (questionLower.includes('typeof null')) {
            return "In JavaScript, typeof null returns 'object' due to a legacy bug in the language. This is a well-known quirk that has been preserved for backward compatibility.";
        }

        if (questionLower.includes('http status') && correctAnswer.includes('201')) {
            return "HTTP 201 Created indicates that a new resource has been successfully created as a result of the request. 200 OK is for successful retrieval, not creation.";
        }

        if (questionLower.includes('cap theorem')) {
            return "The CAP theorem states that distributed systems can only guarantee two of three properties: Consistency, Availability, and Partition tolerance. The 'P' stands for Partition tolerance.";
        }

        if (questionLower.includes('quicksort') && questionLower.includes('worst case')) {
            return "QuickSort's worst-case time complexity is O(n²) when the pivot is always the smallest or largest element, causing unbalanced partitions.";
        }

        if (questionLower.includes('zero-downtime') && questionLower.includes('deployment')) {
            return "Blue-green deployment with expand-contract pattern and feature flags provides the safest zero-downtime deployment by maintaining two identical environments and gradual database schema changes.";
        }

        if (questionLower.includes('security') && questionLower.includes('distributed system')) {
            return "Zero-trust architecture with behavioral analytics, micro-segmentation, and encrypted service mesh provides comprehensive security by never trusting any component by default.";
        }

        if (questionLower.includes('real-time analytics') && questionLower.includes('latency')) {
            return "Kappa architecture with stream processing and in-memory computing provides the lowest latency for real-time analytics by processing data as it arrives without batch delays.";
        }

        // Management concepts
        if (questionLower.includes('managing') && questionLower.includes('team')) {
            return "Establishing clear processes is fundamental to effective team management as it provides structure, reduces confusion, and ensures consistent execution.";
        }

        if (questionLower.includes('scope creep')) {
            return "Evaluating impact and negotiating priorities is the best approach to scope creep as it maintains project control while being responsive to legitimate business needs.";
        }

        // HR/Workplace concepts
        if (questionLower.includes('collaborate') && questionLower.includes('team')) {
            return "A flexible mix of remote and in-person collaboration maximizes both efficiency and team cohesion in modern work environments.";
        }

        if (questionLower.includes('motivation') && questionLower.includes('professional')) {
            return "Team success and continuous learning drive sustainable professional growth and create positive work environments.";
        }

        // Generic fallback explanation
        return `The correct answer is ${correctOption.replace(/^[A-D]\.\s*/, '')} because it represents the most accurate, complete, or best-practice approach to the question asked.`;
    }

    /**
     * Get the full text of the correct answer from options
     * @param {string} correctAnswerLetter - The correct answer letter (A, B, C, D)
     * @param {Array} options - Array of all answer options
     * @returns {string} Full text of the correct answer
     */
    getFullCorrectAnswer(correctAnswerLetter, options) {
        if (!correctAnswerLetter || !options || options.length === 0) {
            return correctAnswerLetter || 'Not Available';
        }

        // Extract just the letter part (handle cases like "A", "A.", "A. Option text")
        const letter = correctAnswerLetter.charAt(0).toUpperCase();

        // Find the option that starts with this letter
        const fullOption = options.find(option =>
            option && option.charAt(0).toUpperCase() === letter
        );

        return fullOption || correctAnswerLetter;
    }

    /**
     * Generate suggestions for descriptive answers
     * @param {Object} detail - Descriptive detail object
     * @returns {Array} Array of suggestions
     */
    generateDescriptiveSuggestions(detail) {
        const suggestions = [];
        const score = detail.score || 0;
        const maxScore = detail.max_score || 3;
        const percentage = maxScore > 0 ? (score / maxScore) * 100 : 0;

        if (percentage === 0) {
            suggestions.push("Consider providing a more detailed response");
            suggestions.push("Research the topic thoroughly before answering");
            suggestions.push("Structure your answer with clear points");
        } else if (percentage < 50) {
            suggestions.push("Good attempt, but needs more depth");
            suggestions.push("Include more specific examples or details");
            suggestions.push("Consider the practical applications of your answer");
        } else if (percentage < 80) {
            suggestions.push("Good understanding demonstrated");
            suggestions.push("Minor improvements in clarity or completeness would help");
            suggestions.push("Consider adding more real-world examples");
        } else {
            suggestions.push("Excellent response!");
            suggestions.push("Strong understanding of the concept");
            suggestions.push("Well-structured and comprehensive answer");
        }

        return suggestions;
    }

    /**
     * Generate overall analysis of the interview
     * @param {Array} rounds - Array of round data
     * @returns {Object} Overall analysis
     */
    generateOverallAnalysis(rounds) {
        const totalScore = rounds.reduce((sum, round) => sum + (round.validation?.total_score || 0), 0);
        const maxPossibleScore = rounds.reduce((sum, round) => sum + (round.validation?.max_possible_score || 0), 0);
        const overallPercentage = maxPossibleScore > 0 ? Math.round((totalScore / maxPossibleScore) * 100) : 0;

        // Analyze performance by round type
        const roundAnalysis = rounds.map(round => ({
            round: round.round,
            name: this.roundNames[round.round],
            percentage: round.validation?.percentage || 0,
            verdict: round.validation?.verdict || 'Not Completed',
            passed: (round.validation?.verdict === 'Pass')
        }));

        // Determine strengths and weaknesses
        const strengths = [];
        const weaknesses = [];

        roundAnalysis.forEach(analysis => {
            if (analysis.passed) {
                strengths.push(`Strong performance in ${analysis.name} (${analysis.percentage}%)`);
            } else if (analysis.percentage > 0) {
                weaknesses.push(`Needs improvement in ${analysis.name} (${analysis.percentage}%)`);
            }
        });

        // Overall verdict
        let overallVerdict = 'Needs Significant Improvement';
        if (overallPercentage >= 80) {
            overallVerdict = 'Excellent Performance';
        } else if (overallPercentage >= 60) {
            overallVerdict = 'Good Performance';
        } else if (overallPercentage >= 40) {
            overallVerdict = 'Average Performance';
        }

        return {
            totalScore,
            maxPossibleScore,
            overallPercentage,
            overallVerdict,
            roundsCompleted: rounds.length,
            roundsPassed: roundAnalysis.filter(r => r.passed).length,
            strengths,
            weaknesses,
            roundAnalysis
        };
    }

    /**
     * Generate improvement suggestions based on performance
     * @param {Array} rounds - Array of round data
     * @returns {Object} Improvement suggestions
     */
    generateImprovementSuggestions(rounds) {
        const suggestions = {
            immediate: [],
            shortTerm: [],
            longTerm: [],
            resources: []
        };

        // Analyze each round for specific suggestions
        rounds.forEach(round => {
            const roundName = this.roundNames[round.round];
            const percentage = round.validation?.percentage || 0;
            const mcqPercentage = round.validation?.mcq?.max_score > 0 ?
                Math.round((round.validation.mcq.score / round.validation.mcq.max_score) * 100) : 0;
            const descPercentage = round.validation?.descriptive?.max_score > 0 ?
                Math.round((round.validation.descriptive.score / round.validation.descriptive.max_score) * 100) : 0;

            if (round.round === 1 || round.round === 2) {
                // Technical rounds
                if (mcqPercentage < 60) {
                    suggestions.immediate.push(`Review fundamental technical concepts for ${roundName}`);
                    suggestions.resources.push("Practice coding problems on platforms like LeetCode, HackerRank");
                }
                if (descPercentage < 60) {
                    suggestions.shortTerm.push(`Improve technical communication skills for ${roundName}`);
                    suggestions.resources.push("Practice explaining technical concepts clearly and concisely");
                }
            } else if (round.round === 3) {
                // Managerial round
                if (percentage < 60) {
                    suggestions.immediate.push("Study management principles and leadership techniques");
                    suggestions.shortTerm.push("Gain experience in team leadership or project management");
                    suggestions.resources.push("Read books on management: 'The Manager's Path', 'First 90 Days'");
                }
            } else if (round.round === 4) {
                // HR round
                if (percentage < 60) {
                    suggestions.immediate.push("Practice behavioral interview questions");
                    suggestions.shortTerm.push("Reflect on your career goals and motivations");
                    suggestions.resources.push("Use the STAR method for behavioral questions");
                }
            }
        });

        // General suggestions based on overall performance
        const overallPercentage = this.calculateOverallPercentage(rounds);

        if (overallPercentage < 40) {
            suggestions.longTerm.push("Consider additional training or certification in your field");
            suggestions.longTerm.push("Seek mentorship from experienced professionals");
            suggestions.longTerm.push("Practice mock interviews regularly");
        } else if (overallPercentage < 70) {
            suggestions.shortTerm.push("Focus on areas of weakness identified in this report");
            suggestions.shortTerm.push("Practice interview scenarios specific to your target role");
        }

        // Remove duplicates
        Object.keys(suggestions).forEach(key => {
            suggestions[key] = [...new Set(suggestions[key])];
        });

        return suggestions;
    }

    /**
     * Calculate overall percentage across all rounds
     * @param {Array} rounds - Array of round data
     * @returns {number} Overall percentage
     */
    calculateOverallPercentage(rounds) {
        const totalScore = rounds.reduce((sum, round) => sum + (round.validation?.total_score || 0), 0);
        const maxPossibleScore = rounds.reduce((sum, round) => sum + (round.validation?.max_possible_score || 0), 0);
        return maxPossibleScore > 0 ? Math.round((totalScore / maxPossibleScore) * 100) : 0;
    }
}

export default new ReportGenerator();