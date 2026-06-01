import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';

export default class CommentsController extends Controller {
  @tracked comments;
  @tracked meta;

  queryParams = ['page', 'sort', 'filter'];
  
  @tracked page = { number: 1, size: 10 };
  @tracked sort = '-createdAt';
  @tracked filter = {};

  @tracked filterAuthor = '';
  @tracked sortField = 'createdAt';
  @tracked sortDirection = 'desc';
  @tracked pageSize = 10;

  get totalPages() {
    return this.meta?.['total-pages'] || 1;
  }

  get totalRecords() {
    return this.meta?.['total-records'] || 0;
  }

  get currentPage() {
    return this.meta?.['current-page'] || 1;
  }

  get canGoPrev() {
    return this.currentPage > 1;
  }

  get canGoNext() {
    return this.currentPage < this.totalPages;
  }

  @action
  applyFilters() {
    const newFilter = {};
    if (this.filterAuthor) {
      newFilter.author = this.filterAuthor;
    }
    this.filter = newFilter;
    this.page = { ...this.page, number: 1 };
  }

  @action
  clearFilters() {
    this.filterAuthor = '';
    this.filter = {};
    this.page = { ...this.page, number: 1 };
  }

  @action
  applySort() {
    const direction = this.sortDirection === 'desc' ? '-' : '';
    this.sort = `${direction}${this.sortField}`;
  }

  @action
  changePageSize() {
    this.page = { number: 1, size: parseInt(this.pageSize) };
  }

  @action
  goToPage(pageNum) {
    this.page = { ...this.page, number: pageNum };
  }

  @action
  prevPage() {
    if (this.canGoPrev) {
      this.page = { ...this.page, number: this.currentPage - 1 };
    }
  }

  @action
  nextPage() {
    if (this.canGoNext) {
      this.page = { ...this.page, number: this.currentPage + 1 };
    }
  }
}
