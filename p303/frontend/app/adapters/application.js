import JSONAPIAdapter from '@ember-data/adapter/json-api';
import ENV from 'frontend/config/environment';

export default class ApplicationAdapter extends JSONAPIAdapter {
  host = ENV.APP.API_HOST;
  namespace = '';

  headers = {
    'Accept': 'application/vnd.api+json',
    'Content-Type': 'application/vnd.api+json'
  };
}
