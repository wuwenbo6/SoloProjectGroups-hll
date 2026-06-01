import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { inject as service } from '@ember/service';
import { action } from '@ember/object';

export default class PostsPostController extends Controller {
  @service store;
  @service router;

  @tracked isEditing = false;
  @tracked editTitle = '';
  @tracked editBody = '';
  @tracked editAuthor = '';
  @tracked editStatus = '';

  @tracked newCommentBody = '';
  @tracked newCommentAuthor = '';

  @action
  startEditing() {
    this.isEditing = true;
    this.editTitle = this.model.title;
    this.editBody = this.model.body;
    this.editAuthor = this.model.author;
    this.editStatus = this.model.status;
  }

  @action
  cancelEditing() {
    this.isEditing = false;
  }

  @action
  async savePost() {
    this.model.title = this.editTitle;
    this.model.body = this.editBody;
    this.model.author = this.editAuthor;
    this.model.status = this.editStatus;
    
    try {
      await this.model.save();
      this.isEditing = false;
    } catch (error) {
      console.error('Failed to save post:', error);
    }
  }

  @action
  async deletePost() {
    if (confirm('确定要删除这篇文章吗？')) {
      try {
        await this.model.destroyRecord();
        this.router.transitionTo('posts');
      } catch (error) {
        console.error('Failed to delete post:', error);
      }
    }
  }

  @action
  async addComment() {
    if (!this.newCommentBody.trim()) return;

    const comment = this.store.createRecord('comment', {
      body: this.newCommentBody,
      author: this.newCommentAuthor || 'Anonymous',
      post: this.model
    });

    try {
      await comment.save();
      this.newCommentBody = '';
      this.newCommentAuthor = '';
    } catch (error) {
      console.error('Failed to add comment:', error);
      comment.rollbackAttributes();
    }
  }

  @action
  async deleteComment(comment) {
    if (confirm('确定要删除这条评论吗？')) {
      try {
        await comment.destroyRecord();
      } catch (error) {
        console.error('Failed to delete comment:', error);
      }
    }
  }
}
