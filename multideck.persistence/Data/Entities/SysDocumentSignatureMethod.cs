using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysDocumentSignatureMethod
{
    public string DocsigmCode { get; set; } = null!;

    public string DocsigmName { get; set; } = null!;

    public string? DocsigmDescription { get; set; }

    public bool DocsigmIsElectronic { get; set; }

    public int DocsigmSortOrder { get; set; }

    public bool DocsigmIsActive { get; set; }

    public DateTime DocsigmCreatedAt { get; set; }
}
