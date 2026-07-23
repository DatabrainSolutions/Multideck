using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysDocumentSignatureFieldType
{
    public string DocsigftCode { get; set; } = null!;

    public string DocsigftName { get; set; } = null!;

    public string? DocsigftDescription { get; set; }

    public bool DocsigftRequiresValue { get; set; }

    public int DocsigftSortOrder { get; set; }

    public bool DocsigftIsActive { get; set; }

    public DateTime DocsigftCreatedAt { get; set; }

    public virtual ICollection<DocsigField> DocsigFields { get; set; } = new List<DocsigField>();
}
