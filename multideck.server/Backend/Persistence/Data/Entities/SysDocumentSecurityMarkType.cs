using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysDocumentSecurityMarkType
{
    public string DocsecmkCode { get; set; } = null!;

    public string DocsecmkName { get; set; } = null!;

    public string? DocsecmkDescription { get; set; }

    public string DocsecmkDefaultSymbology { get; set; } = null!;

    public bool DocsecmkIsMachineReadable { get; set; }

    public bool DocsecmkIsPublicVerification { get; set; }

    public int DocsecmkSortOrder { get; set; }

    public bool DocsecmkIsActive { get; set; }

    public DateTime DocsecmkCreatedAt { get; set; }

    public virtual ICollection<DocbSectionLayoutBlock> DocbSectionLayoutBlocks { get; set; } = new List<DocbSectionLayoutBlock>();

    public virtual ICollection<DocsecDocumentMark> DocsecDocumentMarks { get; set; } = new List<DocsecDocumentMark>();

    public virtual ICollection<DocsecSecurityProfile> DocsecSecurityProfiles { get; set; } = new List<DocsecSecurityProfile>();
}
