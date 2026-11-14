import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Shield, Globe, Search, FileText, AlertTriangle, CheckCircle, Download, Plus, Minus, FileDown, X, List, Lock } from 'lucide-react';
import { useToolAnalytics } from '@/hooks/useToolAnalytics';
import { toast } from 'sonner';
import ToolBreadcrumb from '@/components/ui/ToolBreadcrumb';
import { useNavigate } from 'react-router-dom';
import { categoryOptions } from '@/lib/tools/security-checklist';
import { msg, useT } from '@/i18n';

interface SecurityThreat {
  id: string;
  name: string;
  category: string;
  domain: string[];
  severity: 'Critical' | 'High' | 'Medium' | 'Low';
  type: 'Injection' | 'Authentication' | 'Authorization' | 'Data' | 'Network' | 'Social' | 'Code' | 'Infrastructure' | 'API' | 'Mobile';
  description: string;
  attackMethods: string[];
  prevention: string[];
  detectionMethods: string[];
  impact: string;
  commonTargets: string[];
  relatedThreats: string[];
}

const SecurityChecklist = () => {
  const { t, tr } = useT();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDomain, setSelectedDomain] = useState('all');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedThreat, setSelectedThreat] = useState<SecurityThreat | null>(null);
  const [checklist, setChecklist] = useState<SecurityThreat[]>([]);
  const [checklistName, setChecklistName] = useState(() => t('My Security Checklist'));
  const { trackAction } = useToolAnalytics();

  const handleToolSelect = (toolId: string) => {
    navigate(`/${toolId}`);
  };

  React.useEffect(() => {
    trackAction('tool_accessed', { tool: 'security-checklist' });
  }, [trackAction]);

  const securityThreats: SecurityThreat[] = [
    {
      id: 'xss',
      name: t('Cross-Site Scripting (XSS)'),
      category: msg('Web Application Security'),
      domain: [msg('Frontend'), msg('Web Application'), msg('API')],
      severity: msg('High'),
      type: msg('Injection'),
      description: t('Injection of malicious scripts into web pages viewed by other users.'),
      attackMethods: [
        t('Stored XSS (persistent)'),
        t('Reflected XSS (non-persistent)'),
        t('DOM-based XSS'),
        t('Blind XSS'),
        t('Self-XSS through social engineering')
      ],
      prevention: [
        t('Input validation and sanitization'),
        t('Output encoding/escaping'),
        t('Content Security Policy (CSP)'),
        t('Use of secure frameworks'),
        t('HTTP-only cookies'),
        t('X-XSS-Protection header')
      ],
      detectionMethods: [
        t('Static code analysis'),
        t('Dynamic application security testing (DAST)'),
        t('Manual penetration testing'),
        t('Browser developer tools inspection'),
        t('Web application firewalls (WAF) logs')
      ],
      impact: t('Session hijacking, credential theft, defacement, malware distribution'),
      commonTargets: [t('Input fields'), t('URL parameters'), t('Cookies'), t('Headers'), t('File uploads')],
      relatedThreats: ['csrf', 'clickjacking', 'session-hijacking']
    },
    {
      id: 'sql-injection',
      name: t('SQL Injection'),
      category: msg('Database Security'),
      domain: [msg('Backend'), msg('Database'), msg('API')],
      severity: msg('Critical'),
      type: msg('Injection'),
      description: t('Injection of malicious SQL queries through application inputs.'),
      attackMethods: [
        t('Union-based SQL injection'),
        t('Boolean-based blind SQL injection'),
        t('Time-based blind SQL injection'),
        t('Error-based SQL injection'),
        t('Second-order SQL injection')
      ],
      prevention: [
        t('Parameterized queries/prepared statements'),
        t('Stored procedures with proper input validation'),
        t('Input validation and sanitization'),
        t('Least privilege database access'),
        t('Database activity monitoring'),
        t('Web application firewalls')
      ],
      detectionMethods: [
        t('Code review for dynamic SQL'),
        t('Automated vulnerability scanners'),
        t('Database monitoring tools'),
        t('Manual testing with SQL payloads'),
        t('Static application security testing (SAST)')
      ],
      impact: t('Data breach, data manipulation, authentication bypass, remote code execution'),
      commonTargets: [t('Login forms'), t('Search fields'), t('URL parameters'), t('Cookies'), t('HTTP headers')],
      relatedThreats: ['nosql-injection', 'ldap-injection', 'privilege-escalation']
    },
    {
      id: 'csrf',
      name: t('Cross-Site Request Forgery (CSRF)'),
      category: msg('Web Application Security'),
      domain: [msg('Frontend'), msg('Web Application'), msg('API')],
      severity: msg('Medium'),
      type: msg('Authentication'),
      description: t('Forcing authenticated users to execute unwanted actions.'),
      attackMethods: [
        t('GET-based CSRF attacks'),
        t('POST-based CSRF attacks'),
        t('JSON-based CSRF'),
        t('File upload CSRF'),
        t('Multi-step CSRF chains')
      ],
      prevention: [
        t('CSRF tokens (synchronizer tokens)'),
        t('SameSite cookie attribute'),
        t('Origin/Referer header validation'),
        t('Custom headers for AJAX requests'),
        t('Double submit cookies'),
        t('User interaction requirements')
      ],
      detectionMethods: [
        t('Manual testing with crafted requests'),
        t('Automated CSRF detection tools'),
        t('Browser developer tools'),
        t('Proxy tools (Burp Suite, OWASP ZAP)'),
        t('Code review for missing protections')
      ],
      impact: t('Unauthorized actions, data modification, privilege escalation, financial loss'),
      commonTargets: [t('State-changing operations'), t('Form submissions'), t('AJAX requests'), t('File uploads')],
      relatedThreats: ['xss', 'clickjacking', 'session-fixation']
    },
    {
      id: 'broken-auth',
      name: t('Broken Authentication'),
      category: msg('Authentication & Authorization'),
      domain: [msg('Backend'), msg('Frontend'), msg('API'), msg('Mobile')],
      severity: msg('Critical'),
      type: msg('Authentication'),
      description: t('Flaws in authentication mechanisms allowing attackers to compromise accounts.'),
      attackMethods: [
        t('Credential stuffing attacks'),
        t('Brute force attacks'),
        t('Session fixation'),
        t('Session hijacking'),
        t('Password spraying'),
        t('Account enumeration')
      ],
      prevention: [
        t('Multi-factor authentication (MFA)'),
        t('Strong password policies'),
        t('Account lockout mechanisms'),
        t('Secure session management'),
        t('Password hashing with salt'),
        t('Rate limiting and CAPTCHA')
      ],
      detectionMethods: [
        t('Failed login attempt monitoring'),
        t('Session anomaly detection'),
        t('User behavior analytics'),
        t('Penetration testing'),
        t('Authentication log analysis')
      ],
      impact: t('Account takeover, identity theft, data breach, unauthorized access'),
      commonTargets: [t('Login pages'), t('Password reset flows'), t('Session tokens'), t('API keys')],
      relatedThreats: ['session-hijacking', 'privilege-escalation', 'credential-theft']
    },
    {
      id: 'insecure-deserialization',
      name: t('Insecure Deserialization'),
      category: msg('Code Security'),
      domain: [msg('Backend'), msg('API'), msg('Data Processing')],
      severity: msg('High'),
      type: msg('Code'),
      description: t('Flaws in deserialization leading to remote code execution or other attacks.'),
      attackMethods: [
        t('Object injection attacks'),
        t('Remote code execution via gadget chains'),
        t('Denial of service through resource exhaustion'),
        t('Data tampering during deserialization'),
        t('Type confusion attacks')
      ],
      prevention: [
        t('Avoid deserializing untrusted data'),
        t('Use safe serialization formats (JSON, XML)'),
        t('Implement integrity checks'),
        t('Isolate deserialization in low-privilege environments'),
        t('Monitor deserialization activities'),
        t('Use allowlists for deserializable classes')
      ],
      detectionMethods: [
        t('Code review for deserialization'),
        t('Runtime application self-protection (RASP)'),
        t('Dynamic analysis tools'),
        t('Monitoring for suspicious object creation'),
        t('Static analysis for vulnerable patterns')
      ],
      impact: t('Remote code execution, denial of service, authentication bypass, data corruption'),
      commonTargets: [t('API endpoints'), t('Session data'), t('Cached objects'), t('Message queues')],
      relatedThreats: ['rce', 'privilege-escalation', 'data-tampering']
    },
    {
      id: 'xxe',
      name: t('XML External Entity (XXE)'),
      category: msg('Data Processing Security'),
      domain: [msg('Backend'), msg('API'), msg('Data Processing')],
      severity: msg('High'),
      type: msg('Injection'),
      description: t('Exploitation of XML processors to access internal files or perform SSRF attacks.'),
      attackMethods: [
        t('Local file disclosure'),
        t('Server-side request forgery (SSRF)'),
        t('Denial of service via entity expansion'),
        t('Port scanning through XXE'),
        t('Remote code execution in some cases')
      ],
      prevention: [
        t('Disable XML external entity processing'),
        t('Use simple data formats (JSON)'),
        t('Validate and sanitize XML input'),
        t('Use less complex data formats'),
        t('Implement proper XML parsing configurations'),
        t('Use allowlists for acceptable XML elements')
      ],
      detectionMethods: [
        t('Static code analysis'),
        t('Dynamic application testing'),
        t('Manual testing with XXE payloads'),
        t('XML parser configuration review'),
        t('Network monitoring for unusual requests')
      ],
      impact: t('Data disclosure, SSRF attacks, denial of service, remote code execution'),
      commonTargets: [t('XML parsers'), t('SOAP APIs'), t('Document processing systems'), t('Configuration files')],
      relatedThreats: ['ssrf', 'file-inclusion', 'information-disclosure']
    },
    {
      id: 'ssrf',
      name: t('Server-Side Request Forgery (SSRF)'),
      category: msg('Network Security'),
      domain: [msg('Backend'), msg('API'), msg('Cloud Services')],
      severity: msg('High'),
      type: msg('Network'),
      description: t('Forcing server to make requests to unintended locations.'),
      attackMethods: [
        t('Internal network scanning'),
        t('Cloud metadata service access'),
        t('Local file system access'),
        t('Internal service exploitation'),
        t('Bypassing access controls')
      ],
      prevention: [
        t('Input validation for URLs'),
        t('Allowlist for acceptable domains/IPs'),
        t('Network segmentation'),
        t('Disable unnecessary URL schemes'),
        t('Use proxy servers for external requests'),
        t('Implement request timeouts')
      ],
      detectionMethods: [
        t('Network traffic monitoring'),
        t('Application logs analysis'),
        t('Dynamic testing with SSRF payloads'),
        t('Cloud access logs review'),
        t('Internal network monitoring')
      ],
      impact: t('Internal network access, cloud metadata theft, service enumeration, data exfiltration'),
      commonTargets: [t('URL parameters'), t('File upload features'), t('Webhook endpoints'), t('Image processing')],
      relatedThreats: ['xxe', 'rfi', 'cloud-metadata-theft']
    },
    {
      id: 'privilege-escalation',
      name: t('Privilege Escalation'),
      category: msg('Authorization Security'),
      domain: [msg('Backend'), msg('Operating System'), msg('Database'), msg('Cloud')],
      severity: msg('Critical'),
      type: msg('Authorization'),
      description: t('Gaining higher privileges than intended in the system.'),
      attackMethods: [
        t('Vertical privilege escalation'),
        t('Horizontal privilege escalation'),
        t('Exploiting SUID/SGID binaries'),
        t('Kernel exploits'),
        t('Misconfigured services'),
        t('Weak file permissions')
      ],
      prevention: [
        t('Principle of least privilege'),
        t('Regular access reviews'),
        t('Proper role-based access control'),
        t('Security updates and patches'),
        t('File system permissions hardening'),
        t('Container security best practices')
      ],
      detectionMethods: [
        t('Privilege monitoring tools'),
        t('System call monitoring'),
        t('User behavior analytics'),
        t('Access log analysis'),
        t('Security information and event management (SIEM)')
      ],
      impact: t('System compromise, data breach, unauthorized administrative access'),
      commonTargets: [t('System processes'), t('Database accounts'), t('Application roles'), t('Cloud IAM')],
      relatedThreats: ['broken-auth', 'container-escape', 'lateral-movement']
    },
    {
      id: 'container-escape',
      name: t('Container Escape'),
      category: msg('Infrastructure Security'),
      domain: [msg('Containers'), msg('Cloud'), msg('Infrastructure')],
      severity: msg('Critical'),
      type: msg('Infrastructure'),
      description: t('Breaking out of container isolation to access the host system.'),
      attackMethods: [
        t('Kernel exploits'),
        t('Privileged container abuse'),
        t('Docker daemon exploitation'),
        t('Volume mount manipulation'),
        t('Capability abuse'),
        t('Namespace escape')
      ],
      prevention: [
        t('Run containers as non-root'),
        t('Use security profiles (AppArmor, SELinux)'),
        t('Limit container capabilities'),
        t('Regular base image updates'),
        t('Container runtime security'),
        t('Network segmentation')
      ],
      detectionMethods: [
        t('Runtime security monitoring'),
        t('Container behavior analysis'),
        t('Kernel audit logs'),
        t('Container runtime monitoring'),
        t('Host-based intrusion detection')
      ],
      impact: t('Host system compromise, data exfiltration, lateral movement'),
      commonTargets: [t('Docker containers'), t('Kubernetes pods'), t('Container registries')],
      relatedThreats: ['privilege-escalation', 'lateral-movement', 'supply-chain']
    },
    {
      id: 'supply-chain',
      name: t('Supply Chain Attack'),
      category: msg('Code Security'),
      domain: [msg('Dependencies'), msg('Code Repository'), msg('CI/CD'), msg('Third-party')],
      severity: msg('Critical'),
      type: msg('Code'),
      description: t('Compromising software through malicious dependencies or third-party components.'),
      attackMethods: [
        t('Malicious package injection'),
        t('Dependency confusion attacks'),
        t('Compromised package maintainer accounts'),
        t('Build system compromise'),
        t('Code signing certificate theft'),
        t('Typosquatting attacks')
      ],
      prevention: [
        t('Dependency scanning and management'),
        t('Package integrity verification'),
        t('Private package repositories'),
        t('Code signing verification'),
        t('Regular dependency updates'),
        t('Software bill of materials (SBOM)')
      ],
      detectionMethods: [
        t('Dependency vulnerability scanners'),
        t('Package behavior monitoring'),
        t('Build system audit logs'),
        t('Code repository monitoring'),
        t('Network traffic analysis')
      ],
      impact: t('Code injection, data theft, backdoor installation, widespread compromise'),
      commonTargets: [t('npm packages'), t('Docker images'), t('CI/CD pipelines'), t('Code repositories')],
      relatedThreats: ['code-injection', 'backdoor', 'malware']
    },
    {
      id: 'social-engineering',
      name: t('Social Engineering'),
      category: msg('Human Factor Security'),
      domain: [msg('Human Factor'), msg('Email'), msg('Phone'), msg('Physical')],
      severity: msg('High'),
      type: msg('Social'),
      description: t('Manipulating people to divulge confidential information or perform actions.'),
      attackMethods: [
        t('Phishing emails with malicious links'),
        t('Unicode/punycode domain spoofing'),
        t('Malicious email attachments'),
        t('Spear phishing targeting executives'),
        t('Pretexting and impersonation'),
        t('Baiting with infected downloads'),
        t('Quid pro quo scams'),
        t('Tailgating/piggybacking'),
        t('Vishing (voice phishing)'),
        t('Smishing (SMS phishing)')
      ],
      prevention: [
        t('Security awareness training'),
        t('Email security solutions'),
        t('Multi-factor authentication'),
        t('Verification procedures'),
        t('Physical access controls'),
        t('Incident reporting systems')
      ],
      detectionMethods: [
        t('Email security monitoring'),
        t('User behavior analytics'),
        t('Phishing simulation results'),
        t('Incident reporting analysis'),
        t('Physical security monitoring')
      ],
      impact: t('Credential theft, data breach, financial fraud, system compromise'),
      commonTargets: [t('Employees'), t('Executives'), t('IT staff'), t('Customer service')],
      relatedThreats: ['phishing', 'credential-theft', 'insider-threat']
    },
    {
      id: 'api-security',
      name: t('API Security Vulnerabilities'),
      category: msg('API Security'),
      domain: [msg('API'), msg('Backend'), msg('Mobile'), msg('Integration')],
      severity: msg('High'),
      type: msg('API'),
      description: t('Various security flaws in API design, implementation, and configuration.'),
      attackMethods: [
        t('Broken object level authorization'),
        t('Broken user authentication'),
        t('Excessive data exposure'),
        t('Rate limiting bypass'),
        t('Mass assignment'),
        t('Security misconfiguration')
      ],
      prevention: [
        t('Proper authentication and authorization'),
        t('Input validation and sanitization'),
        t('Rate limiting implementation'),
        t('Data minimization'),
        t('API security testing'),
        t('Secure API design patterns')
      ],
      detectionMethods: [
        t('API security testing tools'),
        t('Traffic monitoring and analysis'),
        t('Authentication log review'),
        t('Automated vulnerability scanning'),
        t('Manual penetration testing')
      ],
      impact: t('Data breach, unauthorized access, service disruption, data manipulation'),
      commonTargets: [t('REST APIs'), t('GraphQL endpoints'), t('Mobile app APIs'), t('Microservices')],
      relatedThreats: ['broken-auth', 'information-disclosure', 'rate-limit-bypass']
    },
    {
      id: 'cloud-misconfig',
      name: t('Cloud Misconfiguration'),
      category: msg('Cloud Security'),
      domain: [msg('Cloud'), msg('Infrastructure'), msg('Storage'), msg('IAM')],
      severity: msg('High'),
      type: msg('Infrastructure'),
      description: t('Improper configuration of cloud services leading to security vulnerabilities.'),
      attackMethods: [
        t('Public cloud storage access'),
        t('Overprivileged IAM roles'),
        t('Unsecured cloud databases'),
        t('Open security groups'),
        t('Misconfigured load balancers'),
        t('Exposed cloud functions')
      ],
      prevention: [
        t('Cloud security posture management'),
        t('Infrastructure as code (IaC) scanning'),
        t('Regular configuration audits'),
        t('Principle of least privilege'),
        t('Automated compliance checking'),
        t('Cloud security benchmarks')
      ],
      detectionMethods: [
        t('Cloud configuration scanners'),
        t('Security monitoring tools'),
        t('Access log analysis'),
        t('Cloud security assessment tools'),
        t('Automated compliance reporting')
      ],
      impact: t('Data exposure, unauthorized access, service disruption, financial loss'),
      commonTargets: [t('S3 buckets'), t('Database instances'), t('IAM policies'), t('Security groups')],
      relatedThreats: ['data-exposure', 'privilege-escalation', 'lateral-movement']
    },
    {
      id: 'cryptographic-failures',
      name: t('Cryptographic Failures'),
      category: msg('Cryptography Security'),
      domain: [msg('Backend'), msg('Frontend'), msg('Database'), msg('Communication')],
      severity: msg('High'),
      type: msg('Data'),
      description: t('Weak or improper implementation of cryptographic controls.'),
      attackMethods: [
        t('Weak encryption algorithms'),
        t('Hard-coded cryptographic keys'),
        t('Improper key management'),
        t('Weak random number generation'),
        t('Certificate validation bypass'),
        t('Timing attacks on crypto operations')
      ],
      prevention: [
        t('Use strong encryption algorithms'),
        t('Proper key management systems'),
        t('Regular key rotation'),
        t('Secure random number generation'),
        t('Certificate pinning'),
        t('Cryptographic library updates')
      ],
      detectionMethods: [
        t('Cryptographic analysis tools'),
        t('Code review for crypto usage'),
        t('Certificate monitoring'),
        t('Network traffic analysis'),
        t('Key management audits')
      ],
      impact: t('Data decryption, man-in-the-middle attacks, identity spoofing'),
      commonTargets: [t('Encrypted data'), t('SSL/TLS connections'), t('API keys'), t('Password storage')],
      relatedThreats: ['mitm', 'data-breach', 'credential-theft']
    },
    {
      id: 'insider-threat',
      name: t('Insider Threat'),
      category: msg('Human Factor Security'),
      domain: [msg('Human Factor'), msg('Access Control'), msg('Data'), msg('Systems')],
      severity: msg('High'),
      type: msg('Social'),
      description: t('Security threats originating from people within the organization.'),
      attackMethods: [
        t('Malicious data exfiltration'),
        t('Sabotage of systems/data'),
        t('Unauthorized access abuse'),
        t('Credential sharing'),
        t('Policy violations'),
        t('Intellectual property theft')
      ],
      prevention: [
        t('Background checks'),
        t('Principle of least privilege'),
        t('Regular access reviews'),
        t('User behavior monitoring'),
        t('Data loss prevention (DLP)'),
        t('Separation of duties')
      ],
      detectionMethods: [
        t('User behavior analytics (UBA)'),
        t('Data access monitoring'),
        t('Privileged account monitoring'),
        t('File access auditing'),
        t('Network traffic analysis')
      ],
      impact: t('Data theft, system sabotage, reputation damage, financial loss'),
      commonTargets: [t('Sensitive data'), t('Critical systems'), t('Intellectual property'), t('Customer data')],
      relatedThreats: ['data-exfiltration', 'privilege-escalation', 'social-engineering']
    },
    {
      id: 'mobile-security',
      name: t('Mobile Application Vulnerabilities'),
      category: msg('Mobile Security'),
      domain: [msg('Mobile'), msg('API'), msg('Data Storage'), msg('Communication')],
      severity: msg('Medium'),
      type: msg('Mobile'),
      description: t('Security vulnerabilities specific to mobile applications and platforms.'),
      attackMethods: [
        t('Insecure data storage'),
        t('Weak cryptography implementation'),
        t('Insecure communication'),
        t('Improper platform usage'),
        t('Insufficient binary protection'),
        t('Client-side injection')
      ],
      prevention: [
        t('Secure coding practices'),
        t('Data encryption at rest and in transit'),
        t('Certificate pinning'),
        t('Code obfuscation'),
        t('Runtime application self-protection'),
        t('Mobile application management (MAM)')
      ],
      detectionMethods: [
        t('Mobile app security testing'),
        t('Static and dynamic analysis'),
        t('Runtime monitoring'),
        t('Network traffic analysis'),
        t('Device compliance checking')
      ],
      impact: t('Data theft, unauthorized access, privacy violations, malware infection'),
      commonTargets: [t('Mobile apps'), t('Device storage'), t('API communications'), t('User credentials')],
      relatedThreats: ['api-security', 'data-exposure', 'mitm']
    },
    {
      id: 'dos-ddos',
      name: t('Denial of Service (DoS/DDoS)'),
      category: msg('Network Security'),
      domain: [msg('Network'), msg('Infrastructure'), msg('Application'), msg('Cloud')],
      severity: msg('Medium'),
      type: msg('Network'),
      description: t('Attacks aimed at making services unavailable to legitimate users.'),
      attackMethods: [
        t('Volume-based attacks (UDP floods)'),
        t('Protocol attacks (SYN floods)'),
        t('Application layer attacks'),
        t('Distributed denial of service'),
        t('Amplification attacks'),
        t('Slowloris attacks')
      ],
      prevention: [
        t('DDoS protection services'),
        t('Rate limiting implementation'),
        t('Load balancing'),
        t('Traffic filtering'),
        t('Capacity planning'),
        t('Content delivery networks (CDN)')
      ],
      detectionMethods: [
        t('Network traffic monitoring'),
        t('Performance monitoring'),
        t('Anomaly detection systems'),
        t('DDoS detection tools'),
        t('Real-time alerting systems')
      ],
      impact: t('Service unavailability, revenue loss, reputation damage, resource exhaustion'),
      commonTargets: [t('Web servers'), t('DNS servers'), t('Load balancers'), t('CDN endpoints')],
      relatedThreats: ['resource-exhaustion', 'amplification-attack', 'botnet']
    },
    {
      id: 'iot-security',
      name: t('IoT Device Vulnerabilities'),
      category: msg('IoT Security'),
      domain: [msg('IoT Devices'), msg('Network'), msg('Firmware'), msg('Communication')],
      severity: msg('Medium'),
      type: msg('Infrastructure'),
      description: t('Security vulnerabilities in Internet of Things devices and ecosystems.'),
      attackMethods: [
        t('Default credential exploitation'),
        t('Firmware vulnerabilities'),
        t('Insecure communication protocols'),
        t('Physical device tampering'),
        t('Device identity spoofing'),
        t('Botnet recruitment')
      ],
      prevention: [
        t('Change default credentials'),
        t('Regular firmware updates'),
        t('Secure communication protocols'),
        t('Device identity management'),
        t('Network segmentation'),
        t('Physical security measures')
      ],
      detectionMethods: [
        t('IoT device monitoring'),
        t('Network traffic analysis'),
        t('Firmware vulnerability scanning'),
        t('Device behavior monitoring'),
        t('Physical security monitoring')
      ],
      impact: t('Device compromise, network infiltration, privacy violations, botnet participation'),
      commonTargets: [t('Smart devices'), t('Industrial IoT'), t('Connected vehicles'), t('Home automation')],
      relatedThreats: ['botnet', 'lateral-movement', 'privacy-violation']
    },
    {
      id: 'business-logic',
      name: t('Business Logic Vulnerabilities'),
      category: msg('Application Security'),
      domain: [msg('Application Logic'), msg('Workflow'), msg('Business Process')],
      severity: msg('Medium'),
      type: msg('Code'),
      description: t('Flaws in the business logic implementation that can be exploited.'),
      attackMethods: [
        t('Workflow bypass'),
        t('Race condition exploitation'),
        t('Price manipulation'),
        t('Quantity/limit bypass'),
        t('State manipulation'),
        t('Time-of-check to time-of-use (TOCTOU)')
      ],
      prevention: [
        t('Thorough business logic testing'),
        t('Input validation and verification'),
        t('Proper state management'),
        t('Concurrency controls'),
        t('Business rule enforcement'),
        t('Regular security reviews')
      ],
      detectionMethods: [
        t('Manual testing of business flows'),
        t('Transaction monitoring'),
        t('Anomaly detection'),
        t('Business process monitoring'),
        t('User behavior analysis')
      ],
      impact: t('Financial loss, unauthorized benefits, data manipulation, process disruption'),
      commonTargets: [t('E-commerce systems'), t('Financial applications'), t('Workflow systems'), t('Gaming platforms')],
      relatedThreats: ['race-condition', 'state-manipulation', 'economic-denial']
    },
    {
      id: 'malware-threats',
      name: t('Malware & Virus Attacks'),
      category: msg('Malware Security'),
      domain: [msg('Backend'), msg('Frontend'), msg('Infrastructure'), msg('Email'), msg('Downloads')],
      severity: msg('Critical'),
      type: msg('Code'),
      description: t('Malicious software designed to damage, disrupt, or gain unauthorized access to systems.'),
      attackMethods: [
        t('Trojan horse delivery via email attachments'),
        t('Virus propagation through file shares'),
        t('Ransomware encryption attacks'),
        t('Spyware and keylogger installation'),
        t('Rootkit system-level compromise'),
        t('Worm network propagation'),
        t('Adware and browser hijacking'),
        t('Cryptocurrency mining malware'),
        t('Fileless malware execution'),
        t('Zero-day exploit payloads')
      ],
      prevention: [
        t('Antivirus and anti-malware solutions'),
        t('Email attachment scanning'),
        t('Safe browsing practices'),
        t('Regular software updates'),
        t('Application sandboxing'),
        t('Network traffic filtering'),
        t('User education and training'),
        t('Backup and recovery systems'),
        t('Endpoint detection and response (EDR)'),
        t('Behavior-based detection')
      ],
      detectionMethods: [
        t('Real-time malware scanning'),
        t('Network behavior analysis'),
        t('File integrity monitoring'),
        t('Process behavior monitoring'),
        t('Signature-based detection'),
        t('Heuristic analysis'),
        t('Machine learning detection'),
        t('Honeypot systems'),
        t('Incident response tools'),
        t('Forensic analysis')
      ],
      impact: t('Data theft, system corruption, financial loss, operational disruption, privacy violations'),
      commonTargets: [t('Endpoints'), t('Servers'), t('Email systems'), t('Web browsers'), t('Mobile devices')],
      relatedThreats: ['phishing-attacks', 'social-engineering', 'download-security']
    },
    {
      id: 'phishing-attacks',
      name: t('Phishing & Deceptive Content'),
      category: msg('Social Engineering Security'),
      domain: [msg('Email'), msg('Human Factor'), msg('Web Application'), msg('Mobile')],
      severity: msg('High'),
      type: msg('Social'),
      description: t('Fraudulent attempts to obtain sensitive information through deceptive communications.'),
      attackMethods: [
        t('Email phishing with fake login pages'),
        t('Spear phishing targeting specific individuals'),
        t('Whaling attacks on executives'),
        t('Unicode domain spoofing (punycode)'),
        t('Homograph attacks with similar-looking domains'),
        t('Clone phishing using legitimate email copies'),
        t('Voice phishing (vishing) phone calls'),
        t('SMS phishing (smishing) text messages'),
        t('Social media phishing scams'),
        t('Search engine poisoning')
      ],
      prevention: [
        t('Email security filters and gateways'),
        t('Domain-based Message Authentication (DMARC)'),
        t('Sender Policy Framework (SPF)'),
        t('User awareness training programs'),
        t('Multi-factor authentication (MFA)'),
        t('URL reputation checking'),
        t('Browser security extensions'),
        t('Incident reporting systems'),
        t('Regular security simulations'),
        t('DNS filtering for malicious domains')
      ],
      detectionMethods: [
        t('Email header analysis'),
        t('URL and domain reputation checking'),
        t('Phishing simulation results'),
        t('User reporting mechanisms'),
        t('Threat intelligence feeds'),
        t('Browser security warnings'),
        t('Network traffic analysis'),
        t('Machine learning classification'),
        t('Real-time link scanning'),
        t('Brand monitoring services')
      ],
      impact: t('Credential theft, financial fraud, data breach, identity theft, malware infection'),
      commonTargets: [t('Login credentials'), t('Financial information'), t('Personal data'), t('Corporate secrets')],
      relatedThreats: ['social-engineering', 'malware-threats', 'credential-theft']
    },
    {
      id: 'download-security',
      name: t('Malicious Downloads & File Security'),
      category: msg('File Security'),
      domain: [msg('Downloads'), msg('Web Application'), msg('Email'), msg('File Storage')],
      severity: msg('High'),
      type: msg('Data'),
      description: t('Security risks associated with downloading and handling files from untrusted sources.'),
      attackMethods: [
        t('Malware-infected executable files'),
        t('Trojaned software packages'),
        t('Compromised document files (PDF, Office)'),
        t('Drive-by downloads from malicious websites'),
        t('Watering hole attacks'),
        t('Software supply chain attacks'),
        t('Fake software updates'),
        t('Bundled adware and PUPs'),
        t('Archive bombs (zip bombs)'),
        t('Steganography in image files')
      ],
      prevention: [
        t('File scanning and sandboxing'),
        t('Digital signature verification'),
        t('Software from trusted sources only'),
        t('Browser security settings'),
        t('Download reputation checking'),
        t('File type restrictions'),
        t('Quarantine systems for suspicious files'),
        t('User education on safe downloads'),
        t('Network-based file filtering'),
        t('Automated threat analysis')
      ],
      detectionMethods: [
        t('Real-time file scanning'),
        t('Behavioral analysis of downloaded files'),
        t('Hash verification and reputation'),
        t('Static and dynamic malware analysis'),
        t('Network traffic monitoring'),
        t('File integrity monitoring'),
        t('Threat intelligence integration'),
        t('User activity monitoring'),
        t('Endpoint detection systems'),
        t('Cloud-based security scanning')
      ],
      impact: t('Malware infection, data theft, system compromise, privacy violations, financial loss'),
      commonTargets: [t('User devices'), t('Corporate networks'), t('File servers'), t('Email systems')],
      relatedThreats: ['malware-threats', 'phishing-attacks', 'supply-chain']
    }
  ];

  const domains = ['all', msg('Frontend'), msg('Backend'), msg('Database'), 'API', msg('Mobile'), msg('Cloud'), msg('Network'), msg('Infrastructure'), msg('IoT Devices'), msg('Human Factor')];
  // Derived from the data so categories such as Cryptography Security or File Security can be selected.
  const categories = categoryOptions(securityThreats);

  const filteredThreats = useMemo(() => {
    return securityThreats.filter(threat => {
      const matchesSearch = searchTerm === '' || 
        threat.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        threat.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t(threat.category).toLowerCase().includes(searchTerm.toLowerCase()) ||
        threat.domain.some(d => t(d).toLowerCase().includes(searchTerm.toLowerCase()));
      
      const matchesDomain = selectedDomain === 'all' || threat.domain.includes(selectedDomain);
      const matchesCategory = selectedCategory === 'all' || threat.category === selectedCategory;
      
      return matchesSearch && matchesDomain && matchesCategory;
    });
  }, [searchTerm, selectedDomain, selectedCategory]);

  const addToChecklist = (threat: SecurityThreat) => {
    if (!checklist.find(item => item.id === threat.id)) {
      setChecklist([...checklist, threat]);
      toast.success(t('Added {name} to checklist', { name: threat.name }));
    } else {
      toast.info(t('Item already in checklist'));
    }
  };

  const removeFromChecklist = (threatId: string) => {
    setChecklist(checklist.filter(item => item.id !== threatId));
    toast.success(t('Removed from checklist'));
  };

  const downloadMarkdown = () => {
    const content = generateMarkdownContent();
    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${checklistName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.md`;
    a.click();
    URL.revokeObjectURL(url);
    trackAction('security_checklist_downloaded', { format: 'markdown', items: checklist.length });
  };

  const generateMarkdownContent = () => {
    const date = new Date().toLocaleDateString();
    let content = `# ${checklistName}\n\n`;
    content += `${t('Generated on: {date}', { date })}\n`;
    content += `${t('Total Security Threats: {count}', { count: checklist.length })}\n\n`;
    content += `## ${t('Disclaimer')}\n`;
    content += `${t('This checklist contains the most common security threats and provides a good starting point for security assessment. Please conduct proper due diligence and consult security experts before implementing in production environments.')}\n\n`;
    content += `---\n\n`;

    checklist.forEach((threat, index) => {
      content += `## ${index + 1}. ${threat.name}\n\n`;
      content += `**${t('Category:')}** ${t(threat.category)}\n`;
      content += `**${t('Type:')}** ${t(threat.type)}\n`;
      content += `**${t('Severity:')}** ${t(threat.severity)}\n`;
      content += `**${t('Domains:')}** ${threat.domain.map((d) => t(d)).join(', ')}\n\n`;
      content += `**${t('Description:')}** ${threat.description}\n\n`;
      content += `**${t('Common Attack Methods:')}**\n`;
      threat.attackMethods.forEach(method => {
        content += `- [ ] ${method}\n`;
      });
      content += `\n**${t('Prevention Measures:')}**\n`;
      threat.prevention.forEach(prevention => {
        content += `- [ ] ${prevention}\n`;
      });
      content += `\n**${t('Detection Methods:')}**\n`;
      threat.detectionMethods.forEach(detection => {
        content += `- [ ] ${detection}\n`;
      });
      content += `\n**${t('Potential Impact:')}** ${threat.impact}\n\n`;
      content += `**${t('Common Targets:')}** ${threat.commonTargets.join(', ')}\n\n`;
      content += `---\n\n`;
    });

    content += `\n*${t('Generated with the RedBison Security Threat Checklist ({url})', { url: 'redbison.dev/security-checklist' })}*`;
    return content;
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'Critical': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      case 'High': return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200';
      case 'Medium': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
      case 'Low': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'Injection': return <AlertTriangle className="h-4 w-4" />;
      case 'Authentication': return <Lock className="h-4 w-4" />;
      case 'Authorization': return <Shield className="h-4 w-4" />;
      case 'Data': return <FileText className="h-4 w-4" />;
      case 'Network': return <Globe className="h-4 w-4" />;
      case 'Social': return <AlertTriangle className="h-4 w-4" />;
      case 'Code': return <CheckCircle className="h-4 w-4" />;
      case 'Infrastructure': return <Shield className="h-4 w-4" />;
      case 'API': return <Globe className="h-4 w-4" />;
      case 'Mobile': return <Shield className="h-4 w-4" />;
      default: return <AlertTriangle className="h-4 w-4" />;
    }
  };

  return (
    <>
      <div className="min-h-screen bg-gradient-to-br from-background to-secondary/20 p-4">
        <div className="max-w-6xl mx-auto">
          <ToolBreadcrumb
            category={{ label: t('Development & Tech'), href: "/category/development-tech" }}
            subcategory={{ label: t('Security Tools'), href: "/category/development-tech/security-tools" }}
            toolName="Security Checklist"
          />
          <div className="text-left mb-8 mt-6">
            <h1 className="text-4xl font-bold mb-4 text-primary flex items-center gap-3">
              <Shield className="h-10 w-10 text-red-600" />
              {t('Security Threat Checklist')}
            </h1>
            <p className="text-xl text-muted-foreground mb-6 max-w-3xl">
              {t('Browse 22 common threat classes with prevention and detection measures, then export your own Markdown checklist')}
          </p>
        </div>

        <Tabs defaultValue="browse" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="browse" className="flex items-center gap-2">
              <Search className="h-4 w-4" />
              {t('Browse Threats')}
            </TabsTrigger>
            <TabsTrigger value="checklist" className="flex items-center gap-2">
              <List className="h-4 w-4" />
              {t('Security Checklist ({length})', { length: checklist.length })}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="browse" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Search className="h-5 w-5" />
                  {t('Search & Filter Security Threats')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <Input
                    placeholder={t('Search threats...')}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="md:col-span-2"
                  />
                  
                  <Select value={selectedDomain} onValueChange={setSelectedDomain}>
                    <SelectTrigger>
                      <SelectValue placeholder={t('Select Domain')} />
                    </SelectTrigger>
                    <SelectContent>
                      {domains.map(domain => (
                        <SelectItem key={domain} value={domain}>
                          {domain === 'all' ? t('All Domains') : t(domain)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                    <SelectTrigger>
                      <SelectValue placeholder={t('Select Category')} />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map(category => (
                        <SelectItem key={category} value={category}>
                          {category === 'all' ? t('All Categories') : t(category)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex justify-between items-center mt-4">
                  <p className="text-sm text-muted-foreground">
                    {t('Showing {length} of {length2} security threats', { length: filteredThreats.length, length2: securityThreats.length })}
                  </p>
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredThreats.map((threat) => (
                <Dialog key={threat.id}>
                  <DialogTrigger asChild>
                    <Card className="cursor-pointer hover:shadow-lg transition-shadow duration-200">
                      <CardHeader>
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <CardTitle className="text-lg flex items-center gap-2">
                              {getTypeIcon(threat.type)}
                              {threat.name}
                            </CardTitle>
                            <CardDescription className="mt-2">
                              {t(threat.category)}
                            </CardDescription>
                          </div>
                          <div className="flex flex-col gap-2">
                            <Badge className={getSeverityColor(threat.severity)}>
                              {t(threat.severity)}
                            </Badge>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={(e) => {
                                e.stopPropagation();
                                addToChecklist(threat);
                              }}
                              className="h-8"
                            >
                              <Plus className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm text-muted-foreground mb-4 line-clamp-3">
                          {threat.description}
                        </p>
                        
                        <div className="space-y-2">
                          <div>
                            <p className="text-xs font-medium text-muted-foreground">{t('DOMAINS')}</p>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {threat.domain.slice(0, 3).map((domain) => (
                                <Badge key={domain} variant="secondary" className="text-xs">
                                  {t(domain)}
                                </Badge>
                              ))}
                              {threat.domain.length > 3 && (
                                <Badge variant="secondary" className="text-xs">
                                  +{threat.domain.length - 3}
                                </Badge>
                              )}
                            </div>
                          </div>

                          <div>
                            <p className="text-xs font-medium text-muted-foreground">{t('TYPE')}</p>
                            <Badge variant="outline" className="text-xs mt-1">
                              {t(threat.type)}
                            </Badge>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </DialogTrigger>

                  <DialogContent className="max-w-4xl max-h-[80vh]">
                    <DialogHeader>
                      <DialogTitle className="flex items-center gap-2">
                        {getTypeIcon(threat.type)}
                        {threat.name}
                        <Badge variant="secondary">{t(threat.type)}</Badge>
                      </DialogTitle>
                      <DialogDescription>
                        {threat.description}
                      </DialogDescription>
                    </DialogHeader>

                    <ScrollArea className="max-h-[60vh]">
                      <div className="space-y-6">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <h4 className="font-semibold mb-2">{t('Category & Severity')}</h4>
                            <div className="flex gap-2">
                              <Badge variant="outline">{t(threat.category)}</Badge>
                              <Badge className={getSeverityColor(threat.severity)}>
                                {t(threat.severity)}
                              </Badge>
                            </div>
                          </div>
                          <div>
                            <h4 className="font-semibold mb-2">{t('Impact')}</h4>
                            <p className="text-sm text-muted-foreground">
                              {threat.impact}
                            </p>
                          </div>
                        </div>

                        <div>
                          <h4 className="font-semibold mb-2">{t('Affected Domains')}</h4>
                          <div className="flex flex-wrap gap-2">
                            {threat.domain.map((domain) => (
                              <Badge key={domain} variant="secondary">
                                {t(domain)}
                              </Badge>
                            ))}
                          </div>
                        </div>

                        <div>
                          <h4 className="font-semibold mb-2">{t('Common Attack Methods')}</h4>
                          <ul className="space-y-1">
                            {threat.attackMethods.map((method, index) => (
                              <li key={index} className="text-sm flex items-start gap-2">
                                <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
                                {method}
                              </li>
                            ))}
                          </ul>
                        </div>

                        <div>
                          <h4 className="font-semibold mb-2">{t('Prevention Measures')}</h4>
                          <ul className="space-y-1">
                            {threat.prevention.map((prevention, index) => (
                              <li key={index} className="text-sm flex items-start gap-2">
                                <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                                {prevention}
                              </li>
                            ))}
                          </ul>
                        </div>

                        <div>
                          <h4 className="font-semibold mb-2">{t('Detection Methods')}</h4>
                          <ul className="space-y-1">
                            {threat.detectionMethods.map((method, index) => (
                              <li key={index} className="text-sm flex items-start gap-2">
                                <Search className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
                                {method}
                              </li>
                            ))}
                          </ul>
                        </div>

                        <div>
                          <h4 className="font-semibold mb-2">{t('Common Targets')}</h4>
                          <div className="flex flex-wrap gap-2">
                            {threat.commonTargets.map((target) => (
                              <Badge key={target} variant="outline">
                                {target}
                              </Badge>
                            ))}
                          </div>
                        </div>

                        <div>
                          <h4 className="font-semibold mb-2">{t('Related Threats')}</h4>
                          <div className="flex flex-wrap gap-2">
                            {threat.relatedThreats.map((related) => {
                              const relatedThreat = securityThreats.find(t => t.id === related);
                              return relatedThreat ? (
                                <Badge key={related} variant="outline" className="cursor-pointer"
                                  onClick={() => setSelectedThreat(relatedThreat)}>
                                  {relatedThreat.name}
                                </Badge>
                              ) : null;
                            })}
                          </div>
                        </div>
                      </div>
                    </ScrollArea>
                  </DialogContent>
                </Dialog>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="checklist" className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <List className="h-5 w-5" />
                      {t('Security Threat Checklist')}
                    </CardTitle>
                    <CardDescription>
                      {t('{length} threat', { length: checklist.length })}{checklist.length !== 1 ? 's' : ''}{' '}{t('selected')}
                    </CardDescription>
                  </div>
                  {checklist.length > 0 && (
                    <div className="flex gap-2">
                      <Button onClick={downloadMarkdown} variant="outline" size="sm">
                        <FileDown className="h-4 w-4 mr-2" />
                        {t('Download MD')}
                      </Button>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {checklist.length > 0 && (
                  <div className="mb-4">
                    <Input
                      placeholder={t('Checklist name...')}
                      value={checklistName}
                      onChange={(e) => setChecklistName(e.target.value)}
                      className="mb-4"
                    />
                  </div>
                )}
                
                {checklist.length === 0 ? (
                  <div className="text-center py-8">
                    <List className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-semibold mb-2">{t('No items in checklist')}</h3>
                    <p className="text-muted-foreground">
                      {t('Browse the threats tab and click the + button to add items to your security checklist.')}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {checklist.map((threat) => (
                      <Card key={threat.id} className="border-l-4 border-l-red-500">
                        <CardHeader className="pb-2">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <CardTitle className="text-base flex items-center gap-2">
                                {getTypeIcon(threat.type)}
                                {threat.name}
                                <Badge className={getSeverityColor(threat.severity)} variant="secondary">
                                  {t(threat.severity)}
                                </Badge>
                              </CardTitle>
                              <CardDescription>{t(threat.category)}</CardDescription>
                            </div>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => removeFromChecklist(threat.id)}
                              className="text-red-500 hover:text-red-700"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        </CardHeader>
                        <CardContent className="pt-0">
                          <p className="text-sm text-muted-foreground mb-2">
                            {threat.description}
                          </p>
                          <div className="flex flex-wrap gap-1 mb-2">
                            {threat.domain.slice(0, 3).map((domain) => (
                              <Badge key={domain} variant="outline" className="text-xs">
                                {t(domain)}
                              </Badge>
                            ))}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {t('{length} attack methods • {length2} prevention measures', { length: threat.attackMethods.length, length2: threat.prevention.length })}
                          </p>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {filteredThreats.length === 0 && (
          <div className="text-center py-12">
            <AlertTriangle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">{t('No threats found')}</h3>
            <p className="text-muted-foreground">
              {t('Try adjusting your search criteria or filters.')}
            </p>
          </div>
        )}
      </div>
      
      <Alert className="mt-8">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          {tr('{label} This checklist contains the most common security threats and provides a good starting point for security assessment. Please conduct proper due diligence and consult security experts before implementing in production environments.', { label: <strong>{t('Disclaimer:')}</strong> })}
        </AlertDescription>
      </Alert>

    </div>
    </>
  );
};

export default SecurityChecklist;