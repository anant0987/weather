// Get references to the main UI elements
const cityInput = document.getElementById('cityInput');
const searchBtn = document.getElementById('searchBtn');
const statusBox = document.getElementById('statusBox');
const weatherCard = document.getElementById('weatherCard');
const suggestionsBox = document.getElementById('suggestionsBox');
const forecastToggle = document.getElementById('forecastToggle');
const forecastSection = document.getElementById('forecastSection');
const forecastList = document.getElementById('forecastList');
const liveTime = document.getElementById('liveTime');
const airQuality = document.getElementById('airQuality');
const airQualityLabel = document.getElementById('airQualityLabel');
let suggestionsTimeout = null;

// Show or update the status message box
function showStatus(message, isError = true) {
    statusBox.textContent = message;
    statusBox.classList.remove('hidden');
    statusBox.classList.toggle('border-rose-500/30', isError);
    statusBox.classList.toggle('bg-rose-950/20', isError);
    statusBox.classList.toggle('text-rose-300', isError);
}

// Hide the status box when no warning is needed
function hideStatus() {
    statusBox.classList.add('hidden');
}

// Hide the city suggestion list
function hideSuggestions() {
    suggestionsBox.innerHTML = '';
    suggestionsBox.classList.add('hidden');
}

// Hide the forecast section when not needed
function hideForecast() {
    forecastList.innerHTML = '';
    forecastSection.classList.add('hidden');
}

// Show city suggestions returned from the geocoding API
function renderSuggestions(results) {
    if (!results.length) {
        hideSuggestions();
        return;
    }

    suggestionsBox.innerHTML = '';
    results.forEach((place) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'block w-full rounded-lg px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-800';
        button.textContent = `${place.name}${place.admin1 ? `, ${place.admin1}` : ''}, ${place.country}`;
        button.addEventListener('click', () => {
            cityInput.value = place.name;
            hideSuggestions();
            handleSearch();
        });
        suggestionsBox.appendChild(button);
    });
    suggestionsBox.classList.remove('hidden');
}

// Fetch city suggestions from the geocoding service
async function getCitySuggestions(query) {
    if (query.length < 2) {
        hideSuggestions();
        return;
    }

    try {
        const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=5&language=en&format=json`);
        if (!res.ok) return;

        const data = await res.json();
        const results = (data.results || []).filter((place) => place.name).slice(0, 5);
        renderSuggestions(results);
    } catch (error) {
        hideSuggestions();
    }
}

// Convert weather codes into simple emoji icons
function getWeatherEmoji(code) {
    if (code === 0) return '☀️';
    if (code === 1 || code === 2) return '⛅';
    if (code === 3) return '☁️';
    if ([45, 48].includes(code)) return '🌫️';
    if ([51, 53, 55, 61, 63, 65, 80, 81, 82].includes(code)) return '🌧️';
    if ([71, 73, 75].includes(code)) return '❄️';
    if (code === 95) return '⛈️';
    return '🌤️';
}

// Map weather codes to readable text descriptions
function translateWeatherCode(code) {
    const map = {
        0: 'Clear sky',
        1: 'Mainly clear',
        2: 'Partly cloudy',
        3: 'Overcast',
        45: 'Foggy',
        48: 'Rime fog',
        51: 'Light drizzle',
        53: 'Moderate drizzle',
        55: 'Dense drizzle',
        61: 'Light rain',
        63: 'Rain',
        65: 'Heavy rain',
        71: 'Light snow',
        73: 'Snow',
        75: 'Heavy snow',
        80: 'Showers',
        81: 'Rain showers',
        82: 'Heavy showers',
        95: 'Thunderstorm'
    };
    return map[code] || 'Variable conditions';
}

function updateLiveClock() {
    const now = new Date();
    const formattedDate = now.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
    const formattedTime = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' });
    document.getElementById('dateText').textContent = formattedDate;
    liveTime.textContent = formattedTime;
}

function getAirQualityLabel(aqi) {
    if (aqi <= 50) return 'Good';
    if (aqi <= 100) return 'Moderate';
    if (aqi <= 150) return 'Unhealthy for sensitive groups';
    if (aqi <= 200) return 'Unhealthy';
    if (aqi <= 300) return 'Very unhealthy';
    return 'Hazardous';
}

async function getAirQuality(latitude, longitude) {
    try {
        const airUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${latitude}&longitude=${longitude}&hourly=us_aqi&timezone=auto`;
        const airRes = await fetch(airUrl);
        if (!airRes.ok) return null;

        const airData = await airRes.json();
        const aqi = airData?.hourly?.us_aqi?.[0];
        if (typeof aqi !== 'number' || Number.isNaN(aqi)) return null;

        return { aqi, label: getAirQualityLabel(aqi) };
    } catch (error) {
        return null;
    }
}

// Fetch weather details for a city entered by the user
async function getWeatherByCity(city) {
    hideStatus();
    hideForecast();
    const geocodeUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`;

    const geoRes = await fetch(geocodeUrl);
    if (!geoRes.ok) throw new Error('Unable to reach the weather service.');

    const geoData = await geoRes.json();
    if (!geoData.results || geoData.results.length === 0) {
        throw new Error('No city found. Please try another name.');
    }

    const location = geoData.results[0];
    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${location.latitude}&longitude=${location.longitude}&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto`;

    const weatherRes = await fetch(weatherUrl);
    if (!weatherRes.ok) throw new Error('Weather data could not be loaded.');

    const weatherData = await weatherRes.json();
    const airQualityData = await getAirQuality(location.latitude, location.longitude);

    renderWeather({
        city: location.name,
        country: location.country,
        temp: weatherData.current.temperature_2m,
        feelsLike: weatherData.current.apparent_temperature,
        humidity: weatherData.current.relative_humidity_2m,
        wind: weatherData.current.wind_speed_10m,
        description: translateWeatherCode(weatherData.current.weather_code),
        emoji: getWeatherEmoji(weatherData.current.weather_code),
        airQuality: airQualityData?.aqi ?? null,
        airQualityLabel: airQualityData?.label ?? 'Unavailable'
    });

    if (forecastToggle.checked) {
        renderForecast(weatherData.daily);
    }
}

// Fill the weather card with the fetched data
function renderWeather(data) {
    document.getElementById('location').innerHTML = `${data.city}, ${data.country}`;
    updateLiveClock();
    document.getElementById('temp').textContent = `${Math.round(data.temp)}°C`;
    document.getElementById('description').innerHTML = `${data.emoji} ${data.description}`;
    document.getElementById('feelsLike').textContent = `${Math.round(data.feelsLike)}°C`;
    document.getElementById('humidity').textContent = `${data.humidity}%`;
    document.getElementById('wind').textContent = `${data.wind.toFixed(1)} km/h`;
    airQuality.textContent = data.airQuality !== null ? `${Math.round(data.airQuality)} US AQI` : 'Unavailable';
    airQualityLabel.textContent = data.airQualityLabel || 'No data';
    weatherCard.classList.remove('hidden');
}

// Render the next five days of forecast data
function renderForecast(daily) {
    if (!daily || !daily.time || !daily.time.length) {
        hideForecast();
        return;
    }

    const days = daily.time.slice(0, 5).map((date, index) => ({
        date,
        code: daily.weather_code?.[index],
        max: daily.temperature_2m_max?.[index],
        min: daily.temperature_2m_min?.[index]
    }));

    forecastList.innerHTML = '';
    days.forEach((day) => {
        const card = document.createElement('div');
        card.className = 'rounded-xl border border-white/10 bg-slate-800/80 p-3 text-center';
        const dayName = new Date(day.date).toLocaleDateString('en-US', { weekday: 'short' });
        card.innerHTML = `
            <p class="text-sm font-semibold">${dayName}</p>
            <p class="mt-2 text-2xl">${getWeatherEmoji(day.code)}</p>
            <p class="mt-2 text-sm text-slate-300">${translateWeatherCode(day.code)}</p>
            <p class="mt-2 text-sm font-semibold">${Math.round(day.max)}° / ${Math.round(day.min)}°</p>
        `;
        forecastList.appendChild(card);
    });

    forecastSection.classList.remove('hidden');
}

// Handle the search button click and validation
async function handleSearch() {
    const city = cityInput.value.trim();
    if (!city) {
        showStatus('Please enter a city name.');
        return;
    }

    try {
        await getWeatherByCity(city);
    } catch (error) {
        showStatus(error.message);
    }
}

// Attach event listeners for search, Enter key, and live suggestions
searchBtn.addEventListener('click', handleSearch);
cityInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
        hideSuggestions();
        handleSearch();
    }
});

cityInput.addEventListener('input', () => {
    clearTimeout(suggestionsTimeout);
    const query = cityInput.value.trim();

    if (!query) {
        hideSuggestions();
        return;
    }

    suggestionsTimeout = setTimeout(() => {
        getCitySuggestions(query);
    }, 250);
});

cityInput.addEventListener('blur', () => {
    setTimeout(hideSuggestions, 150);
});

updateLiveClock();
setInterval(updateLiveClock, 1000);
