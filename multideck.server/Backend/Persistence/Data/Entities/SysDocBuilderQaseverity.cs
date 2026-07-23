using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysDocBuilderQaseverity
{
    public string DocbqasCode { get; set; } = null!;

    public string DocbqasName { get; set; } = null!;

    public bool DocbqasIsBlocking { get; set; }

    public int DocbqasSortOrder { get; set; }

    public bool DocbqasIsActive { get; set; }

    public DateTime DocbqasCreatedAt { get; set; }

    public virtual ICollection<DocbTemplateQaissue> DocbTemplateQaissues { get; set; } = new List<DocbTemplateQaissue>();
}
