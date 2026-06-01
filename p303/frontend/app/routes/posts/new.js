import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

export default class PostsNewRoute extends Route {
  @service store;
  @service router;

  model() {
    return this.store.createRecord('post', {
      title: '',
      body: '',
      author: '',
      status: 'draft'
    });
  }
}
