export default {
    testEnvironment: 'node',
    transform: {},
    testMatch: ['**/__tests__/**/*.js', '**/?(*.)+(spec|test).js'],
    collectCoverageFrom: [
        'routes/**/*.js',
        'middleware/**/*.js',
        '!**/node_modules/**'
    ]
}