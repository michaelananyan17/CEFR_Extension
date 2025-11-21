// Content script for text rewriting
let originalTexts = new Map();
let isRewritten = false;

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'rewritePage') {
        rewritePageContent(request.apiKey, request.targetLevel)
            .then(result => sendResponse(result))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true; // Keep message channel open for async response
    }
    
    if (request.action === 'resetPage') {
        resetPageContent();
        sendResponse({ success: true });
    }
});

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

// Create prompt for text rewriting
function createRewritingPrompt(text, targetLevel) {
    return `Please rewrite the following text to match CEFR level ${targetLevel} English. 

CRITICAL REQUIREMENTS:
- Maintain the original meaning and key information
- Use vocabulary and sentence structures appropriate for ${targetLevel} level
- Keep the same overall structure and tone
- Ensure the text remains natural and readable
- Do not add any explanations or notes

CEFR Level ${targetLevel} Guidelines:
${getLevelGuidelines(targetLevel)}

Original Text:
"${text}"

Rewritten Text (${targetLevel} level):`;
}

// Get CEFR level guidelines
function getLevelGuidelines(level) {
    const guidelines = {
        'A1': 'Use very basic phrases and simple vocabulary. Short sentences. Everyday expressions.',
        'A2': 'Use basic sentences and common vocabulary. Direct communication about familiar topics.',
        'B1': 'Use clear standard language. Can handle main points on familiar topics. Straightforward connected text.',
        'B2': 'Use more complex sentences and vocabulary. Can handle abstract and technical topics.',
        'C1': 'Use sophisticated language and complex structures. Fluent and precise expression.',
        'C2': 'Use highly sophisticated language with nuance and precision. Native-like fluency.'
    };
    
    return guidelines[level] || 'Use appropriate language for the specified level.';
}

// Main function to rewrite page content
async function rewritePageContent(apiKey, targetLevel) {
    try {
        // Store original texts if not already stored
        if (!isRewritten) {
            storeOriginalTexts();
        }
        
        // Extract main content from the page
        const textContent = extractMainContent();
        
        if (!textContent.trim()) {
            throw new Error('No readable text content found on this page');
        }
        
        // Rewrite the content using OpenAI API
        const rewrittenContent = await rewriteTextWithOpenAI(textContent, targetLevel, apiKey);
        
        // Replace the content on the page
        replacePageContent(rewrittenContent);
        
        isRewritten = true;
        return { success: true, originalLength: textContent.length, newLength: rewrittenContent.length };
        
    } catch (error) {
        console.error('Content rewriting error:', error);
        return { success: false, error: error.message };
    }
}

// Store original text content
function storeOriginalTexts() {
    originalTexts.clear();
    
    // Select elements that typically contain readable text
    const textElements = document.querySelectorAll(`
        h1, h2, h3, h4, h5, h6,
        p, span, div, article, section,
        li, td, th, figcaption,
        [class*="text"], [class*="content"],
        .content, .text, .article, .post,
        main, .main, .body, .story
    `);
    
    textElements.forEach((element, index) => {
        if (element.textContent && element.textContent.trim().length > 10) {
            originalTexts.set(index, {
                element: element,
                originalText: element.textContent,
                originalHTML: element.innerHTML
            });
        }
    });
}

// Extract main content from the page
function extractMainContent() {
    const contentSelectors = [
        'main',
        'article',
        '[role="main"]',
        '.content',
        '.main-content',
        '.post-content',
        '.article-content',
        '.story-content',
        '.entry-content'
    ];
    
    let mainContent = '';
    
    // Try to find main content containers first
    for (const selector of contentSelectors) {
        const element = document.querySelector(selector);
        if (element && getTextContentLength(element) > 100) {
            mainContent = element.textContent;
            break;
        }
    }
    
    // If no main content found, use body text
    if (!mainContent || mainContent.length < 100) {
        mainContent = document.body.textContent;
    }
    
    // Clean up the text
    return cleanTextContent(mainContent);
}

// Get text content length
function getTextContentLength(element) {
    return element.textContent.replace(/\s+/g, ' ').trim().length;
}

// Clean text content
function cleanTextContent(text) {
    return text
        .replace(/\s+/g, ' ')
        .replace(/\n+/g, '\n')
        .trim()
        .substring(0, 8000); // Limit to avoid token limits
}

// Replace page content with rewritten text
function replacePageContent(rewrittenContent) {
    // Simple approach: Replace the entire body content
    const body = document.body;
    const originalHTML = body.innerHTML;
    
    // Create a smooth transition
    body.style.opacity = '0.7';
    body.style.transition = 'opacity 0.5s ease';
    
    setTimeout(() => {
        // Replace main text elements while preserving structure
        replaceTextElements(rewrittenContent);
        
        body.style.opacity = '1';
    }, 300);
}

// Replace text elements with rewritten content
function replaceTextElements(rewrittenContent) {
    // Split the rewritten content by paragraphs or sentences
    const paragraphs = rewrittenContent.split(/\n\n+/);
    let currentParagraph = 0;
    
    // Replace content in stored elements
    originalTexts.forEach((item, index) => {
        if (currentParagraph < paragraphs.length && item.originalText.length > 20) {
            const newText = paragraphs[currentParagraph] || paragraphs[paragraphs.length - 1];
            
            // Preserve some original structure if it's HTML
            if (item.originalHTML === item.originalText) {
                item.element.textContent = newText;
            } else {
                // Try to preserve some HTML structure
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = item.originalHTML;
                const textNodes = getTextNodes(tempDiv);
                
                if (textNodes.length > 0) {
                    textNodes[0].nodeValue = newText;
                    item.element.innerHTML = tempDiv.innerHTML;
                } else {
                    item.element.textContent = newText;
                }
            }
            
            currentParagraph++;
        }
    });
}

// Get text nodes from an element
function getTextNodes(element) {
    const textNodes = [];
    
    function findTextNodes(node) {
        if (node.nodeType === Node.TEXT_NODE) {
            textNodes.push(node);
        } else {
            node.childNodes.forEach(findTextNodes);
        }
    }
    
    findTextNodes(element);
    return textNodes;
}

// Reset page to original content
function resetPageContent() {
    if (!isRewritten) return;
    
    originalTexts.forEach(item => {
        item.element.innerHTML = item.originalHTML;
    });
    
    isRewritten = false;
    
    // Smooth transition
    document.body.style.opacity = '0.7';
    setTimeout(() => {
        document.body.style.opacity = '1';
    }, 300);
}
