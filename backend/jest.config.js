module.exports = {
  testEnvironment: 'node',
  reporters: [
    'default',
    ['jest-junit', { outputDirectory: './reports', outputName: 'junit.xml' }],
  ],
};