using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysDocBuilderPageType
{
    public string DocbptCode { get; set; } = null!;

    public string DocbptName { get; set; } = null!;

    public string? DocbptDescription { get; set; }

    public int DocbptSortOrder { get; set; }

    public bool DocbptIsActive { get; set; }

    public DateTime DocbptCreatedAt { get; set; }

    public virtual ICollection<DocbTemplatePage> DocbTemplatePages { get; set; } = new List<DocbTemplatePage>();
}
