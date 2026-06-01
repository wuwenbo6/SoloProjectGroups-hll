import Controller from '@ember/controller';
import { inject as service } from '@ember/service';
import { action } from '@ember/object';

export default class PostsNewController extends Controller {
  @service router;

  @action
  async savePost(event) {
    event.preventDefault();
    
    try {
      await this.model.save();
      this.router.transitionTo('posts.post', this.model);
    } catch (error) {
      console.error('Failed to save post:', error);
    }
  }

  @action
  cancel() {
    this.model.rollbackAttributes();
    this.router.transitionTo('posts');
  }
}
