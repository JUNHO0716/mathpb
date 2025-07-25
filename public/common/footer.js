<script>
document.addEventListener('DOMContentLoaded', () => {
  fetch('/common/footer.html')
    .then(res => res.text())
    .then(html => {
      document.getElementById('footer-placeholder').innerHTML = html;
    })
    .catch(console.error);
});
</script>