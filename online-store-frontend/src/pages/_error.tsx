function Error({ statusCode }: { statusCode: number }) {
  return (
    <div style={{ padding: '20px', textAlign: 'center', minHeight: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
      <h1 style={{ fontSize: '48px', fontWeight: 'bold', margin: '0 0 10px 0' }}>
        {statusCode || 500}
      </h1>
      <p style={{ fontSize: '18px', color: '#666', margin: 0 }}>
        {statusCode === 404 ? 'Page not found' : 'An error occurred on the server'}
      </p>
    </div>
  );
}

Error.getInitialProps = ({ res, err }: { res: any; err: any }) => {
  const statusCode = res ? res.statusCode : err ? err.statusCode : 404;
  return { statusCode };
};

export default Error;
