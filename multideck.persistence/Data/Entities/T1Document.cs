using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class T1Document
{
    public Guid T1dId { get; set; }

    public Guid T1dT1id { get; set; }

    public Guid? T1dT1itemId { get; set; }

    public string? T1dDocumentRole { get; set; }

    public string? T1dDocumentCode { get; set; }

    public string? T1dDocumentReference { get; set; }

    public string T1dDocumentJson { get; set; } = null!;

    public DateTime T1dCreatedAt { get; set; }

    public Guid? T1dJobDocumentId { get; set; }

    public virtual SysCustomsDocumentRole? T1dDocumentRoleNavigation { get; set; }

    public virtual JobDocument? T1dJobDocument { get; set; }

    public virtual T1Declaration T1dT1 { get; set; } = null!;

    public virtual T1Item? T1dT1item { get; set; }
}
