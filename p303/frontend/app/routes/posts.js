import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

export default class PostsRoute extends Route {
  @service store;

  queryParams = {
    page: {
      refreshModel: true
    },
    sort: {
      refreshModel: true
    },
    filter: {
      refreshModel: true
    }
  };

  model(params) {
    const query = {};
    
    if (params.page) {
      query.page = params.page;
    }
    
    if (params.sort) {
      query.sort = params.sort;
    }
    
    if (params.filter) {
      query.filter = params.filter;
    }

    query.include = 'comments';
    
    return this.store.query('post', query);
  }

  setupController(controller, model) {
    super.setupController(controller, model);
    controller.set('posts', model);
    controller.set('meta', model.meta);
  }
}
