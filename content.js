// Enhanced text rewriting with better error handling
async function rewriteTextWithOpenAI(text, targetLevel, apiKey) {
    // Validate input
    if (!text || text.length < 10) {
        throw new Error('Text content is too short to rewrite');
    }
    
    if (!apiKey) {
        throw new Error('OpenAI API key is required');
    }
    
    const prompt = createRewritingPrompt(text, targetLevel);
    
    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: 'gpt-3.5-turbo',
                messages: [
                    {
                        role: 'system',
                        content: `You are a professional text rewriter that adapts content to specific CEFR English levels. 
                                 IMPORTANT: Return ONLY the rewritten text without any explanations, notes, or additional text.
                                 Maintain the original meaning while adapting to ${targetLevel} level.`
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                max_tokens: Math.min(4000, text.length * 2),
                temperature: 0.7
            })
        });
        
        if (response.status === 401) {
            throw new Error('Invalid API key. Please check your API key in the extension settings.');
        }
        
        if (response.status === 429) {
            throw new Error('Rate limit exceeded. Please wait a moment and try again.');
        }
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`API Error: ${errorData.error?.message || 'Unknown error'}`);
        }
        
        const data = await response.json();
        const rewrittenText = data.choices[0].message.content.trim();
        
        if (!rewrittenText) {
            throw new Error('OpenAI returned empty response');
        }
        
        return rewrittenText;
        
    } catch (error) {
        console.error('OpenAI API Error:', error);
        throw new Error(`Failed to rewrite text: ${error.message}`);
    }
}