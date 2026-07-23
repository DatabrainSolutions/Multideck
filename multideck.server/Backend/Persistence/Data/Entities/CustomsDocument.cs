using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CustomsDocument
{
    public Guid CustdId { get; set; }

    public Guid CustdCustomsId { get; set; }

    public Guid? CustdCustomsItemId { get; set; }

    public string? CustdDocumentRole { get; set; }

    public string? CustdDocumentCode { get; set; }

    public string? CustdDocumentReference { get; set; }

    public string? CustdDocumentStatusCode { get; set; }

    public string CustdDocumentPayloadJson { get; set; } = null!;

    public DateTime CustdCreatedAt { get; set; }

    public Guid? CustdJobDocumentId { get; set; }

    public virtual CustomsDeclaration CustdCustoms { get; set; } = null!;

    public virtual CustomsItem? CustdCustomsItem { get; set; }

    public virtual SysCustomsDocumentRole? CustdDocumentRoleNavigation { get; set; }

    public virtual JobDocument? CustdJobDocument { get; set; }
}
