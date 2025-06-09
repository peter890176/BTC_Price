# Crypto Price Dashboard

A real-time cryptocurrency price dashboard built with React that displays Bitcoin price information using interactive charts and real-time updates.

## Live Demo

Visit the live application at: [https://todaypricebtc.netlify.app/](https://todaypricebtc.netlify.app/)

## Features

- Real-time Bitcoin price tracking
- Interactive price charts using Chart.js
- Material UI components for a modern look and feel
- WebSocket connection for live price updates
- Responsive design for all device sizes

## Prerequisites

Before you begin, ensure you have the following installed:
- Node.js (v14.0.0 or higher)
- npm (v6.0.0 or higher)

## Installation

1. Clone the repository:
```bash
git clone [your-repository-url]
cd BTC_Price
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm start
```

The application will open in your default browser at [http://localhost:3000](http://localhost:3000).

## Available Scripts

- `npm start` - Runs the app in development mode
- `npm test` - Launches the test runner
- `npm run build` - Builds the app for production
- `npm run eject` - Ejects from Create React App

## Technologies Used

- React 19
- Material UI
- Chart.js
- WebSocket for real-time updates
- Create React App

## Project Structure

```
BTC_Price/
├── public/          # Static files
├── src/            # Source files
├── package.json    # Project dependencies
└── README.md       # Project documentation
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Deployment

This project is deployed on Netlify. The deployment process is automated through GitHub integration. Any changes pushed to the main branch will trigger an automatic deployment.

To deploy your own version:
1. Fork this repository
2. Connect your Netlify account to your GitHub repository
3. Configure the build settings:
   - Build command: `npm run build`
   - Publish directory: `build`
4. Deploy!
