import Model, { attr, hasMany } from '@ember-data/model';

export default class PostModel extends Model {
  @attr('string') title;
  @attr('string') body;
  @attr('string') author;
  @attr('string') status;
  @attr('date') createdAt;

  @hasMany('comment', { async: true, inverse: 'post' }) comments;
}
