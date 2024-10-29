const axios = require('axios');
require('dotenv').config();

const OPENFAAS_GATEWAY = process.env.OPENFAAS_GATEWAY;

if (!OPENFAAS_GATEWAY) {
  console.error('OPENFAAS_GATEWAY is not set in the environment variables');
  process.exit(1);
}

const languageMap = {
  python: 'python3-runner',
  javascript: 'js-runner',
  java: 'java-runner',
  c: 'c-runner',
  cpp: 'cpp-runner'
};

exports.execute = async (language, code, input = '') => {
  const functionName = languageMap[language.toLowerCase()];
  
  if (!functionName) {
    return {
      error: `Unsupported language: ${language}. Please choose from: ${Object.keys(languageMap).join(', ')}.`
    };
  }

  try {
    const url = `${OPENFAAS_GATEWAY}/function/${functionName}`;
    const payload = {
      code: code,
      inputs: input,
      requestId: `exec-${language}-${Date.now()}` // Updated requestId to match the language
    };
    
    console.log(`Sending request to: ${url}`);
    console.log(`Request payload:`, payload);
    
    const response = await axios.post(url, payload, {
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });
    
    console.log(`Response status:`, response.status);
    console.log(`Response data:`, response.data);

    // Ensure we're returning the data in a consistent format
    return {
      result: response.data.result || response.data,
      error: response.data.error || ''
    };

  } catch (error) {
    console.error(`Error executing ${language} code:`, error.message);
    
    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      console.error('Error data:', error.response.data);
      return {
        error: error.response.data || `Error executing ${language} code: ${error.message}`,
        status: error.response.status
      };
    } else if (error.request) {
      // The request was made but no response was received
      return { error: 'No response received from the server' };
    } else {
      // Something happened in setting up the request that triggered an Error
      return { error: `Error executing ${language} code: ${error.message}` };
    }
  }
};

exports.getSupportedLanguages = () => {
  return Object.keys(languageMap);
};