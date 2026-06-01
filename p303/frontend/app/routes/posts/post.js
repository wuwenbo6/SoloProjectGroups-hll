import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

export default class PostsPostRoute extends Route {
  @service store;

  model(params) {
    return this.store.findRecord('post', params.post_id, { include: 'comments' });
  }
}
