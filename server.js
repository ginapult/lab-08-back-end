'use strict';

//Load environment variables from the dotenv file
require('dotenv').config();

//Application dependencies
const express = require('express');
const cors = require('cors');
const superagent = require('superagent');
const pg = require('pg');

//Application setup
const PORT = process.env.PORT || 3000;

//Database setup
const client = new pg.Client(process.env.DATABASE_URL);
client.connect();
client.on('error', err => console.error(err));

const app = express();
app.use(cors());

//API route handlers
app.get('/location', (request, response) => {
  getLocation(request.query.data)
    .then(locationData => response.send(locationData))
    .catch(error => handleError(error, response));
});

app.get('/weather', weatherIdentify);
app.get('/events', eventsIdentify);

//Constructor functions
function Location(query, res) {
  this.search_query = query;
  this.formatted_query = res.results[0].formatted_address;
  this.latitude = res.results[0].geometry.location.lat;
  this.longitude = res.results[0].geometry.location.lng;
}

//Checking the DB for location data
function getLocation(query) {
  const SQL = `SELECT * FROM locations WHERE search_query=$1`;
  const values = [query];
  return client.query(SQL,values)
    .then(results => {
      if(results.rowCount > 0) {
        console.log('From SQL');
        return results.rows[0];
      } else {
        const _URL = `https://maps.googleapis.com/maps/api/geocode/json?address=${query}&key=${process.env.GEOCODE_API_KEY}`
        return superagent.get(_URL)
          .then(data => {
            console.log('From API');
            if (!data.body.results.length) { throw 'No Data'; }
            else {
              let location = new Location(query, data.body.results[0]);
              let newSQL = `
              INSERT INTO locations
                (search_query,formatted_query,latitude,longitude)
                VALUES($1,$2,$3,$4)
                RETURNING id
            `;
              let newValues = Object.values(location);
              return client.query(newSQL, newValues)
                .then(results => {
                  location.id = results.rows[0].id;
                  return location;
                })
                .catch(console.error);
            }
          });
      }
    })
    .catch(console.error);
}

//Save location to DB
Location.prototype.save = function() {
}

//Check DB for location
Location.lookupLocation = (handler) => {


}


function Weather(day) {
  this.forecast = day.summary;
  this.time = new Date(day.time * 1000).toDateString();
}

function Event(place) {
  this.link = place.url;
  this.name = place.name.text;
  this.event_date = new Date(place.start.local).toDateString();
  this.summary = place.summary;
}

// function Movie() {
//   this.title
//   this.overview
//   this.average_votes
//   this.total_votes
//   this.image_url
//   this.popularity
//   this.released_on
// }

//Helper functions
// function locationIdentify(req, res) {
//   const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${req.query.data}&key=${process.env.GEOCODE_API_KEY}`

//   let location;

//   return superagent.get(geocodeUrl)
//     .then (data => {
//       location = new Location(req.query.data, JSON.parse(data.text));
//       res.send(location);
//     })
//     .catch (err => {
//       res.send(err);
//     })
// }

function weatherIdentify(req, res) {
  const weatherUrl = `https://api.darksky.net/forecast/${process.env.WEATHER_API_KEY}/${req.query.data.latitude},${req.query.data.longitude}`

  return superagent.get(weatherUrl)
    .then (data => {
      const weatherEntries = data.body.daily.data.map(day => {
        return new Weather(day);
      })
      res.send(weatherEntries);
    })
    .catch (err => {
      res.send(err);
    })
}

function eventsIdentify(req, res) {
  const eventsUrl = `https://www.eventbriteapi.com/v3/events/search?location.longitude=${req.query.data.longitude}&location.latitude=${req.query.data.latitude}&token=${process.env.EVENTS_API_KEY}`

  return superagent.get(eventsUrl)
    .then (data => {
      const eventsNearby = [];
      for (let i = 0; i < 10; i++) {
        eventsNearby.push(new Event(data.body.events[i]));
      }
      res.send(eventsNearby);
    })
    .catch (err => {
      res.send(err);
    })
}

//Error handler
function handleError(error, res) {
  console.error('ERR', error);
  if (res) res.status(500).send('Sorry, something went wrong');
}


//Make sure the server is listening for requests
app.listen(PORT, () => console.log(`Listening to PORT: ${PORT}`));
