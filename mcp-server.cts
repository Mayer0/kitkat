cat << EOF > mcp-server.cts
// --- 1. CommonJS Imports (require) ---
const { Server, HttpTransport } = require('@modelcontextprotocol/sdk'); 

const express = require('express');
const cors = require('cors');
const { randomUUID } = require('crypto');

// --- Typescript Type Definitions for Clarity ---
interface Offer {
    id: string;
    name: string;
    price: number;
    description: string;
}
interface OfferData {
    home: Offer[];
    business: Offer[];
}
interface GetOffersInput {
    category?: string;
}
interface CreateLinkInput {
    offer_id: string;
}


// --- MOCK DATA ---
const OFFERS: OfferData = { // Added type to ensure strong typing
    home: [
        { id: "home_basic", name: "Home Basic Shield", price: 49.99, description: "Door/Window sensors, 24/7 monitoring." },
        { id: "home_pro", name: "Home Pro+", price: 99.99, description: "Includes cameras, smart alerts, and fire monitoring." }
    ],
    business: [
        { id: "biz_starter", name: "Business Starter", price: 79.99, description: "Basic access control and alarm monitoring." },
        { id: "biz_fortress", name: "Business Fortress", price: 199.99, description: "Full video surveillance, remote access, advanced analytics." }
    ]
};

// 2. Create the Server Instance
const server = new Server({
    name: 'security-sales-tool', 
    version: '1.0.0',
    title: 'Security Sales Agent Tool'
});

// 3. Define the Tools 

server.registerTool(
    'getOffers',
    {
        title: 'Fetch Security Package Offers',
        description: "Fetches security package offers available in 'home' or 'business' categories. Output includes IDs, names, and prices.",
        inputSchema: {
            type: "object",
            properties: {
                category: {
                    type: "string",
                    description: "The category of offers requested ('home' or 'business')."
                }
            }
        }
    } as const, // Added as const to satisfy TypeScript type inference
    // Explicitly type the input parameter
    async (input: GetOffersInput) => {
        const selectedCategory = input.category ? input.category.toLowerCase() : 'home';

        // Explicitly check for array index
        const offers = OFFERS[selectedCategory as keyof OfferData] || OFFERS.home; 

        console.log(`MCP Tool Call: getOffers, Category: ${selectedCategory}`);

        return {
            content: [{
                type: 'text',
                text: JSON.stringify({ offers: offers }) 
            }]
        };
    }
);

server.registerTool(
    'createPurchaseLink',
    {
        title: 'Generate Purchase Link',
        description: "Generates a secure checkout link using the offer_id provided by the user.",
        inputSchema: {
            type: "object",
            required: ["offer_id"],
            properties: {
                offer_id: {
                    type: "string",
                    description: "The exact ID of the chosen offer (e.g., 'home_pro')."
                }
            }
        }
    } as const, // Added as const
    // Explicitly type the input parameter
    async (input: CreateLinkInput) => {
        const offer_id = input.offer_id;

        if (!offer_id) {
            return {
                content: [{
                    type: 'text',
                    text: 'Error: Missing offer ID. Please ask the user to specify an ID from the available offers.'
                }]
            };
        }

        const checkoutUrl = `https://your-company.com/checkout/${offer_id.toLowerCase()}?source=agent-${randomUUID().substring(0, 8)}`;

        console.log(`MCP Tool Call: createPurchaseLink, Offer ID: ${offer_id}`);

        return {
            content: [{
                type: 'text',
                text: JSON.stringify({ purchase_url: checkoutUrl })
            }]
        };
    }
);

server.registerTool(
    'generateOfferWidget',
    {
        title: 'Generate Final Sales Offer Widget',
        description: "Formats the raw security offers data into a visually appealing widget for the user, ready for final display in the End Node.",
        inputSchema: {
            type: "object",
            required: ["offers"],
            properties: {
                offers: {
                    type: "array",
                    description: "The array of security offer objects (name, price, description)."
                }
            }
        }
    } as const, // Added as const
    async (input: { offers: Offer[] }) => {
        const offers = input.offers;

        if (!offers || offers.length === 0) {
            return {
                content: [{
                    type: 'text',
                    text: JSON.stringify({
                        status: "error",
                        message: "No offers available to generate widget."
                    })
                }]
            };
        }

        // Generate a themed, professional HTML card structure for the widget
        const widgetHtml = offers.map(offer => \`
            <div class="p-4 bg-white rounded-xl shadow-lg border border-indigo-100 mb-4 transition-all hover:shadow-xl hover:scale-[1.01] cursor-pointer" 
                 data-offer-id="\${offer.id}">
                <div class="flex items-start justify-between">
                    <h3 class="text-xl font-bold text-indigo-700">\${offer.name}</h3>
                    <p class="text-2xl font-extrabold text-gray-900">$\${offer.price.toFixed(2)}</p>
                </div>
                <p class="text-sm text-gray-500 mt-2">\${offer.description}</p>
                <!-- This button would trigger a subsequent action or tool call -->
                <button class="mt-4 w-full bg-indigo-600 text-white py-2 rounded-lg font-medium hover:bg-indigo-700 transition duration-150"
                        onclick="agentCall('createPurchaseLink', {offer_id: '\${offer.id}'})">
                    Select Plan
                </button>
            </div>
        \`).join('');

        const finalWidget = \`
            <div class="p-6 bg-gray-50 rounded-2xl shadow-2xl">
                <h2 class="text-2xl font-extrabold text-indigo-800 border-b pb-3 mb-4">
                    Recommended Security Packages 🛡️
                </h2>
                \${widgetHtml}
                <p class="mt-4 text-xs text-gray-500 text-center">
                    Click 'Select Plan' to generate a unique purchase link.
                </p>
            </div>
        \`;

        // This is the structure the Agent returns and the End Node consumes
        return {
            content: [{
                type: 'text',
                text: JSON.stringify({
                    status: "success",
                    widget_data: {
                        html: finalWidget, // The UI content
                        metadata: { 
                            offers: offers.map(o => o.id) 
                        }
                    }
                })
            }]
        };
    }
);


// 4. Set up the Http Transport
const transport = new HttpTransport({ 
    route: '/mcp' 
});

// 5. Function to Create Express App and Mount MCP Handler
// This function is now exported, making the app reusable by a local runner or AWS Lambda.
async function createMcpExpressApp() {
    const app = express();
    app.use(cors()); 
    app.use(express.json()); // Middleware to parse JSON bodies

    // The transport handler is now bound to the Express app via its middleware function
    app.use(transport.handle); 

    // Connect the server to the transport
    await server.connect(transport);

    return app;
}


// 6. Export the creation function and a local start script
module.exports = {
    createMcpExpressApp,
};
EOF
