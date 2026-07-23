namespace Multideck.Documents.Paths;

public interface IDocumentPathPolicy
{
    DocumentStorageAddress Resolve(DocumentStorageRequest request);
}
