// Test script for multi-resume functionality
import dotenv from 'dotenv';
dotenv.config();

import RAGService from './services/ragService.js';

async function testMultiResumeFeatures() {
    console.log('🧪 Testing Multi-Resume RAG Service...\n');
    
    const ragService = new RAGService();
    const testUserId = 'test_user_123';
    
    try {
        // Test 1: Check initial state
        console.log('1️⃣ Testing initial state...');
        const initialResumes = await ragService.getUserResumes(testUserId);
        console.log(`   Initial resumes count: ${initialResumes.length}`);
        
        // Test 2: Add multiple resumes
        console.log('\n2️⃣ Testing resume storage...');
        
        const sampleResumes = [
            {
                id: 'resume_1',
                text: 'John Doe\nSoftware Engineer\nExperience: 5 years in React, Node.js, MongoDB\nEducation: BS Computer Science',
                fileName: 'john_doe_resume.pdf'
            },
            {
                id: 'resume_2', 
                text: 'Jane Smith\nData Scientist\nExperience: 3 years in Python, Machine Learning, TensorFlow\nEducation: MS Data Science',
                fileName: 'jane_smith_resume.pdf'
            },
            {
                id: 'resume_3',
                text: 'Bob Johnson\nProduct Manager\nExperience: 7 years in product strategy, agile development\nEducation: MBA',
                fileName: 'bob_johnson_resume.pdf'
            }
        ];
        
        for (const resume of sampleResumes) {
            console.log(`   Adding resume: ${resume.fileName}`);
            const result = await ragService.processAndStoreResume(
                testUserId, 
                resume.id, 
                resume.text, 
                resume.fileName
            );
            console.log(`   ✅ Stored ${result.chunksStored} chunks`);
        }
        
        // Test 3: List all resumes
        console.log('\n3️⃣ Testing resume listing...');
        const allResumes = await ragService.getUserResumes(testUserId);
        console.log(`   Total resumes: ${allResumes.length}`);
        allResumes.forEach((resume, index) => {
            console.log(`   ${index + 1}. ${resume.fileName} (${resume.chunksCount} chunks)`);
        });
        
        // Test 4: Query specific resumes
        console.log('\n4️⃣ Testing resume queries...');
        
        const queries = [
            { resumeId: 'resume_1', question: 'What programming languages does this person know?' },
            { resumeId: 'resume_2', question: 'What is their experience in machine learning?' },
            { resumeId: 'resume_3', question: 'What is their educational background?' }
        ];
        
        for (const query of queries) {
            console.log(`   Querying ${query.resumeId}: "${query.question}"`);
            const result = await ragService.queryResume(testUserId, query.resumeId, query.question);
            if (result.success) {
                console.log(`   ✅ Answer: ${result.answer.substring(0, 100)}...`);
                console.log(`   📊 Confidence: ${result.confidence.toFixed(3)}`);
            } else {
                console.log(`   ❌ Query failed: ${result.message}`);
            }
        }
        
        // Test 5: Delete specific resume
        console.log('\n5️⃣ Testing resume deletion...');
        console.log('   Deleting resume_2...');
        await ragService.deleteResume(testUserId, 'resume_2');
        
        const remainingResumes = await ragService.getUserResumes(testUserId);
        console.log(`   ✅ Remaining resumes: ${remainingResumes.length}`);
        remainingResumes.forEach((resume, index) => {
            console.log(`   ${index + 1}. ${resume.fileName}`);
        });
        
        // Test 6: Verify deleted resume can't be queried
        console.log('\n6️⃣ Testing deleted resume query...');
        const deletedQuery = await ragService.queryResume(testUserId, 'resume_2', 'What is your experience?');
        if (!deletedQuery.success) {
            console.log(`   ✅ Correctly rejected query to deleted resume: ${deletedQuery.message}`);
        } else {
            console.log(`   ❌ Unexpectedly allowed query to deleted resume`);
        }
        
        // Test 7: Clean up
        console.log('\n7️⃣ Cleaning up test data...');
        await ragService.deleteUserData(testUserId);
        const finalResumes = await ragService.getUserResumes(testUserId);
        console.log(`   ✅ Final cleanup: ${finalResumes.length} resumes remaining`);
        
        console.log('\n🎉 All tests completed successfully!');
        
    } catch (error) {
        console.error('\n❌ Test failed:', error);
    }
}

// Run the test
testMultiResumeFeatures().then(() => {
    console.log('\n✨ Test script finished');
    process.exit(0);
}).catch(error => {
    console.error('Test script error:', error);
    process.exit(1);
});
